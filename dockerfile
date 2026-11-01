FROM node:24

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# Skip lifecycle scripts here: the client build (`postinstall`) needs the sources, which are copied below.
RUN npm ci --ignore-scripts

# Bundle app source
COPY . .

# Build the React client into ./dist, which server.js serves.
RUN npm run build

# Delete the web.config file, only needed for IIS
RUN rm ./Web.config

EXPOSE 8080
CMD [ "npm", "start" ]
