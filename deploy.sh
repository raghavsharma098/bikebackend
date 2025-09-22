#!/bin/bash

# Server deployment script for aapanel
# Save this file in your server directory and run it on the aapanel server

# Stop the existing Node.js process if it exists
if pm2 list | grep -q "torq-rides"; then
    echo "Stopping existing Node.js process..."
    pm2 stop torq-rides
    pm2 delete torq-rides
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the project if using TypeScript
echo "Building the project..."
npm run build

# Create or update environment file
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.production .env
fi

# Start the Node.js application with PM2
echo "Starting the application with PM2..."
pm2 start dist/index.js --name "torq-rides"
pm2 save

echo "Deployment completed successfully!"
