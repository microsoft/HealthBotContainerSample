FROM node:20

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm install --only=production

# Bundle app source
COPY . .

# The React client (./dist) is built automatically by the `postinstall` hook
# during `npm install` above, and is served by server.js.

# Delete the web.config file, only needed for IIS
RUN rm ./Web.config

EXPOSE 8080
CMD [ "npm", "start" ]
