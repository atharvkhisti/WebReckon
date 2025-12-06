# API Discovery Tool - Backend

## Overview
The API Discovery Tool is a full-stack application designed to help users discover and log API calls made during web interactions. The backend is built using Node.js and Express, and it utilizes Playwright for capturing network requests.

## Getting Started

### Prerequisites
- Node.js (version 14 or higher)
- npm (Node Package Manager)

### Installation
1. Clone the repository:
   ```
   git clone <repository-url>
   cd api-discovery-tool/backend
   ```

2. Install the dependencies:
   ```
   npm install
   ```

### Running the Server
To start the backend server, run the following commands:
```
npm install
npx playwright install
node src/app.js
```
The server will be running on `http://localhost:5000` by default (uses `PORT` if set).

### API Endpoints
- **POST /discover**: Initiates the discovery process by launching Playwright to visit the specified target URL and capturing API calls.

### Directory Structure
- `src/app.js`: Entry point of the application.
- `src/controllers/index.js`: Contains the ApiController for handling requests.
- `src/routes/index.js`: Defines the API routes.
- `src/services/playwrightService.js`: Implements the Playwright service for API discovery.
- `src/utils/index.js`: Utility functions for request and response handling.

### Testing
You can run tests using:
```
npm test
```

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.