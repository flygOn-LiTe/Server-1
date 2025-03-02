FROM node:22

RUN apt-get update && apt-get install -y openjdk-17-jre-headless

WORKDIR /app
COPY . /app

RUN npm install

EXPOSE 8888
EXPOSE 43594

# Run the migration before starting the server
CMD ["sh", "-c", "node tools/server/migrate_saves.js && npm start"]
