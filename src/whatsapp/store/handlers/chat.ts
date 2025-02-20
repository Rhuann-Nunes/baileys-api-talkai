import { type BaileysEventEmitter } from "baileys";
import type { BaileysEventHandler, MakeTransformedPrisma } from "@/types";
import { transformPrisma, logger, emitEvent } from "@/utils";
import { prisma } from "@/config/database";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { Chat, Prisma } from "@prisma/client";

export default function chatHandler(sessionId: string, event: BaileysEventEmitter) {
	const model = prisma.chat;
	let listening = false;

	const set: BaileysEventHandler<"messaging-history.set"> = async ({ chats, isLatest }) => {
		try {
			await prisma.$transaction(async (tx) => {
				if (isLatest) await tx.chat.deleteMany({ where: { sessionId } });

				const existingIds = (
					await tx.chat.findMany({
						select: { id: true },
						where: { id: { in: chats.map((c) => c.id) }, sessionId },
					})
				).map((i) => i.id);
				const processedChats = chats
					.filter((c) => !existingIds.includes(c.id))
					.map((c) => {
						const transformed = transformPrisma(c) as MakeTransformedPrisma<Chat>;
						return {
							...transformed,
							sessionId,
							contactPrimaryIdentityKey: transformed.contactPrimaryIdentityKey ? Buffer.from(transformed.contactPrimaryIdentityKey.toString()) : null,
							tcToken: transformed.tcToken ? Buffer.from(transformed.tcToken.toString()) : null
						} satisfies Prisma.ChatCreateManyInput;
					});

				const chatsAdded = (
					await tx.chat.createMany({
						data: processedChats,
					})
				).count;

				logger.info({ chatsAdded }, "Synced chats");
				emitEvent("chats.set", sessionId, { chats: processedChats });
			});
		} catch (e: any) {
			logger.error(e, "An error occured during chats set");
			emitEvent(
				"chats.set",
				sessionId,
				undefined,
				"error",
				`An error occured during chats set: ${e.message}`,
			);
		}
	};

	const upsert: BaileysEventHandler<"chats.upsert"> = async (chats) => {
		try {
			const results: MakeTransformedPrisma<Chat>[] = [];
			await Promise.any(
				chats
					.map((c) => {
						const transformed = transformPrisma(c) as MakeTransformedPrisma<Chat>;
						const data = {
							...transformed,
							contactPrimaryIdentityKey: transformed.contactPrimaryIdentityKey ? Buffer.from(transformed.contactPrimaryIdentityKey.toString()) : undefined,
							tcToken: transformed.tcToken ? Buffer.from(transformed.tcToken.toString()) : undefined
						} satisfies Prisma.ChatCreateInput;
						return { data, transformed };
					})
					.map(({ data, transformed }) => {
						model.upsert({
							select: { pkId: true },
							create: { ...data, sessionId },
							update: data,
							where: { sessionId_id: { id: data.id, sessionId } },
						});
						results.push(transformed);
					}),
			);
			emitEvent("chats.upsert", sessionId, { chats: results });
		} catch (e: any) {
			logger.error(e, "An error occured during chats upsert");
			emitEvent(
				"chats.upsert",
				sessionId,
				undefined,
				"error",
				`An error occured during chats upsert: ${e.message}`,
			);
		}
	};

	const update: BaileysEventHandler<"chats.update"> = async (updates) => {
		for (const update of updates) {
			try {
				const transformed = transformPrisma(update) as MakeTransformedPrisma<Chat>;
				const data = {
					...transformed,
					contactPrimaryIdentityKey: transformed.contactPrimaryIdentityKey ? Buffer.from(transformed.contactPrimaryIdentityKey.toString()) : null,
					tcToken: transformed.tcToken ? Buffer.from(transformed.tcToken.toString()) : null
				} satisfies Prisma.ChatUpdateInput;

				const existingChat = await model.findUnique({
					where: { sessionId_id: { id: update.id!, sessionId } },
				});

				if (!existingChat) {
					logger.info({ update }, "Chat not found, skipping update");
					continue;
				}

				await model.update({
					select: { pkId: true },
					data: {
						...data,
						unreadCount:
							typeof data.unreadCount === "number"
								? data.unreadCount > 0
									? { increment: data.unreadCount }
									: { set: data.unreadCount }
								: undefined,
					},
					where: { sessionId_id: { id: update.id!, sessionId } },
				});
				emitEvent("chats.update", sessionId, { chats: data });
			} catch (e: any) {
				if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
					return logger.info({ update }, "Got update for non existent chat");
				}

				emitEvent(
					"chats.update",
					sessionId,
					undefined,
					"error",
					`An error occurred during chat update: ${e.message}`,
				);
				logger.error(e, "An error occurred during chat update");
			}
		}
	};

	const del: BaileysEventHandler<"chats.delete"> = async (ids) => {
		try {
			await model.deleteMany({
				where: { id: { in: ids } },
			});
			emitEvent("chats.delete", sessionId, { chats: ids });
		} catch (e: any) {
			logger.error(e, "An error occured during chats delete");
			emitEvent(
				"chats.delete",
				sessionId,
				undefined,
				"error",
				`An error occured during chats delete: ${e.message}`,
			);
		}
	};

	const listen = () => {
		if (listening) return;

		event.on("messaging-history.set", set);
		event.on("chats.upsert", upsert);
		event.on("chats.update", update);
		event.on("chats.delete", del);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off("messaging-history.set", set);
		event.off("chats.upsert", upsert);
		event.off("chats.update", update);
		event.off("chats.delete", del);
		listening = false;
	};

	return { listen, unlisten };
}
