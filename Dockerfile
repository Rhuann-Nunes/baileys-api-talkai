FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json .

# Install git
RUN apk add --no-cache git

RUN npm install --quiet

RUN npx prisma migrate

COPY . .

# Executa o build da aplicação (gera a pasta dist com main.js, entre outros)
RUN npm run build

EXPOSE 3000

# Inicia a aplicação em ambiente de produção (executa "node dist/main.js")
CMD [ "npm", "run", "start" ]
