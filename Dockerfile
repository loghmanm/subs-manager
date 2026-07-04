FROM node:22-alpine

WORKDIR /app

# نصب وابستگی‌ها (بدون devDependencies)
COPY package*.json ./
RUN npm install --omit=dev

# کپی کل سورس برنامه
COPY . .

# پوشه دیتابیس - این مسیر باید به یک Volume/Mount خارج از کانتینر متصل شود
# تا اطلاعات مشترکین با ری‌استارت یا آپدیت کانتینر از بین نرود
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=8080
ENV DATA_DIR=/app/data
EXPOSE 8080

CMD ["node", "server.js"]
