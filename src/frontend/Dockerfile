FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

EXPOSE 2000

CMD ["npm", "run", "dev"]
