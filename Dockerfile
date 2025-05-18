# ---- Base Node ----
FROM node:18-alpine AS base
WORKDIR /app

# Install pnpm for efficient dependency management (optional, can use npm or yarn)
# RUN npm install -g pnpm

# ---- Dependencies ----
FROM base AS dependencies
COPY package.json package-lock.json* ./
# Using npm, ensure only production dependencies for the final image if not using a separate build stage for pruning
# RUN npm ci --omit=dev
# For a multi-stage build, we install all deps here to be available for the build stage
RUN npm ci 

# ---- Build ----
# This stage builds the TypeScript to JavaScript
FROM dependencies AS builder
COPY . .
# If you had test, you could run them here: RUN npm run test
RUN npm run build

# ---- Release ----
# This is the final image that will be deployed
FROM base AS release
ENV NODE_ENV=production

# Copy necessary artifacts from previous stages
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Expose the port the app runs on
# Default to 3000, but Railway will set the PORT environment variable
EXPOSE 3000

# Start the app
# The CMD should be in JSON array format
CMD ["npm", "start"]
