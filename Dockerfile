# syntax=docker/dockerfile:1

FROM node:16.11.0
ENV NODE_ENV=production

RUN mkdir /app
WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

RUN mkdir /app/config
COPY ["app.js", "./"]
RUN npm install --production
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get install -y ffmpeg

CMD [ "node", "app.js" ]