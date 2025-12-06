# Frontend API Discovery Tool

This is the frontend part of the API Discovery Tool project, built using Next.js and TailwindCSS.

## Getting Started

To get started with the frontend application, follow these steps:

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd api-discovery-tool/frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set the backend base URL** (defaults to `http://localhost:5000`):
   ```bash
   export NEXT_PUBLIC_API_BASE_URL="http://localhost:5000"   # PowerShell: $env:NEXT_PUBLIC_API_BASE_URL="http://localhost:5000"
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   Navigate to `http://localhost:3000` (Next.js will switch to 3001 if busy).

## Features

- Input field to enter the target URL for API discovery.
- "Start Discovery" button to initiate the process.
- Display of discovered APIs in a table format, showing Method, URL, Status, and Preview.

## Technologies Used

- **Next.js**: A React framework for server-side rendering and static site generation.
- **TailwindCSS**: A utility-first CSS framework for styling the application.

## Contributing

If you would like to contribute to this project, please fork the repository and submit a pull request.

## License

This project is licensed under the MIT License. See the LICENSE file for details.