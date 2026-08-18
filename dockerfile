FROM node:24

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

# Build the React client (outputs to ./dist, served by server.js)
RUN npm run build

# Delete the web.config file, only needed for IIS
RUN rm ./Web.config

EXPOSE 8080
CMD [ "npm", "start" ]
