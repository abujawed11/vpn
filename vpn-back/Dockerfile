FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache wireguard-tools openssh-client openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5050

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
