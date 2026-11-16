FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
# The release this image is. It is shown on the sign-in page and written to /version.json, which
# read-only post-deploy check 4 compares with the tag that was deployed (CD-4.06 section 7).
ARG RELEASE=dev
ENV VITE_RELEASE=$RELEASE
RUN npm run build && printf '{"product":"Climate Dashboard","app":"national","release":"%s"}\n' "$RELEASE" > dist/version.json

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
