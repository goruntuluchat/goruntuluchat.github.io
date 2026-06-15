# =========================================================================
# 🐳 Dockerfile - HUGGING FACE SPACES RESMİ DOCKER KATMANI (PARÇA 1 / 10)
# =========================================================================
FROM node:24-slim

# SQLite derlemesi için gerekli minimum sistem paketlerini kuruyoruz
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

# Hugging Face Spaces'in zorunlu kıldığı portu ve ortam değişkenini tanımlıyoruz
EXPOSE 7860
ENV PORT=7860

CMD ["node", "server.js"]
