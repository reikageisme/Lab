FROM node:20-alpine

# Install docker CLI so we can run docker commands (like docker compose up) from inside the container
RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
