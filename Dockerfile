FROM node:22

RUN apt-get update && apt-get install -y openjdk-17-jre-headless

WORKDIR /app
COPY . /app

RUN npm install
RUN npm run build  # This rebuilds the server cache

EXPOSE 8888
EXPOSE 43594
EXPOSE 43500
EXPOSE 45099

CMD ["npm", "start"]
