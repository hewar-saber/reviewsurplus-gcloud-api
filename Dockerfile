FROM node:20

WORKDIR /usr/src/app

COPY . .

RUN npm install --unsafe-perm=true

RUN npm install -g typescript

RUN npm run build --prefix /usr/src/app

ENV NODE_ENV=production

CMD ["npm", "start"]

EXPOSE 3000