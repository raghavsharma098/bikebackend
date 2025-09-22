# Deploying Torq-Rides Backend to aaPanel

This guide outlines the steps to deploy the Torq-Rides backend to aaPanel.

## Prerequisites

- Access to an aaPanel server (installation instructions at [aapanel.com](https://www.aapanel.com))
- Basic knowledge of Linux commands
- MongoDB installed either locally or accessible remotely

## Deployment Steps

### 1. Install Node.js in aaPanel

1. Log in to your aaPanel dashboard
2. Navigate to "App Store"
3. Go to "Package Manager" and search for "Node.js"
4. Install Node.js (version 16.x or higher recommended)
5. Also install "PM2" for process management

### 2. Set up MongoDB

If you don't have MongoDB installed yet:

1. In aaPanel App Store, search for "MongoDB"
2. Install MongoDB
3. Note the connection details (host, port, username, password if applicable)
4. Import the database dump from the `database/dump` directory:
   ```bash
   mongorestore --db MyDatabase /path/to/database/dump/MyDatabase
   ```

### 3. Create a Website in aaPanel

1. Go to "Website" in the aaPanel dashboard
2. Click "Add Site"
3. Enter your domain (e.g., your-aapanel-domain.com)
4. Configure SSL (recommended)

### 4. Upload Backend Code

1. Connect to your server via FTP or SSH
2. Create a directory for your application, e.g., `/www/wwwroot/torq-rides-backend`
3. Upload the `server` directory contents to this folder

### 5. Configure Environment Variables

1. Create a `.env` file in your application directory:
   ```bash
   cd /www/wwwroot/torq-rides-backend
   cp .env.production .env
   ```

2. Edit the `.env` file with your specific settings:
   ```bash
   nano .env
   ```

   Update the following:
   - `CLIENT_URL` and `CORS_ORIGIN` to your Vercel frontend URL
   - `MONGODB_URL` and `MONGODB_NAME` to your MongoDB connection details
   - All JWT and other security settings

### 6. Install Dependencies and Build

1. Navigate to your application directory:
   ```bash
   cd /www/wwwroot/torq-rides-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the TypeScript code:
   ```bash
   npm run build
   ```

### 7. Configure PM2 for Process Management

1. Start your application with PM2:
   ```bash
   pm2 start dist/index.js --name "torq-rides"
   ```

2. Set PM2 to start on system boot:
   ```bash
   pm2 save
   pm2 startup
   ```
   Then run the command that is output from the above command.

### 8. Configure Nginx

1. Create a Nginx configuration file:
   ```bash
   nano /www/server/panel/vhost/nginx/your-domain.conf
   ```

2. Copy the contents from the `nginx.conf` file provided in your repository

3. Replace the domain, SSL paths, and application path with your actual values

4. Restart Nginx:
   ```bash
   /etc/init.d/nginx restart
   ```

## Testing Your Deployment

1. Check if your application is running:
   ```bash
   pm2 status
   ```

2. Test the API endpoint:
   ```bash
   curl https://your-aapanel-domain.com/api/v1/healthcheck
   ```

3. Check the application logs if you encounter issues:
   ```bash
   pm2 logs torq-rides
   ```

## Updating Your Application

When you need to update your application:

1. Upload the new code
2. Run the deployment script:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure your backend environment variables properly include your Vercel frontend URL

2. **Database Connection Issues**: Check MongoDB connection string and credentials

3. **Nginx 502 Bad Gateway**: Verify that your Node.js application is running properly

4. **Permission Issues**: Ensure proper file permissions:
   ```bash
   chown -R www:www /www/wwwroot/torq-rides-backend
   chmod +x deploy.sh
   ```
