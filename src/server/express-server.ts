import express from "express";
import type { Application, Request, Response } from "express";
import cors from "cors";
import routes from "@/routes";

export class ExpressServer {
	private app: Application;

	constructor() {
		this.app = express();
		this.setupMiddleware();
		this.setupRoutes();
		this.setupErrorHandling();
	}

	private setupMiddleware() {
		this.app.use(cors());
		this.app.use(express.json());
	}

	private setupRoutes() {
		this.app.use("/", routes);
	}

	private setupErrorHandling() {
		// Handle 404
		this.app.use((_: Request, res: Response) => {
			res.status(404).json({ error: "URL not found" });
		});

		// Handle other errors
		this.app.use((err: any, _: Request, res: Response) => {
			console.error(err);
			res.status(500).json({ error: "Internal server error" });
		});
	}

	public getApp(): Application {
		return this.app;
	}
}
