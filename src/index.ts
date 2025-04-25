// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as http from "http";
import * as fsm from "fs/promises";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import * as imageSize from "image-size";
import puppeteer from "puppeteer";
import * as url from "url"; 

// Promisify the image-size function
const getSizeFromPath = promisify(imageSize.imageSize);

// Interface for image information
export interface ImageInfo {
  path: string;
  width?: number;
  height?: number;
  type?: string;
  size: number; // File size in bytes
}

// Interface for console log entry
export interface ConsoleLogEntry {
  type: string;    // log, warn, error, etc.
  text: string;    // log message content
  timestamp: Date; // when the log was captured
}

/**
 * Get the size of an image file
 */
export async function getImageInfo(filePath: string): Promise<ImageInfo | null> {
  try {
    // Get file stats
    const stats = await fsm.stat(filePath);
    
    // Skip if not a file
    if (!stats.isFile()) {
      return null;
    }
    
    // Check if it's an image based on extension
    const ext = path.extname(filePath).toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'];
    
    if (!imageExtensions.includes(ext)) {
      return null;
    }
    
    // Try to get image dimensions
    try {
      const dimensions = await getSizeFromPath(filePath);
      return {
        path: filePath,
        width: dimensions?.width,
        height: dimensions?.height,
        type: dimensions?.type,
        size: stats.size
      };
    } catch (err) {
      // If we can't get dimensions, just return the file size
      return {
        path: filePath,
        size: stats.size
      };
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return null;
  }
}

/**
 * Scan a directory recursively for images
 */
export async function scanDirectory(dirPath: string, recursive: boolean = false): Promise<ImageInfo[]> {
  const results: ImageInfo[] = [];
  
  try {
    const entries = await fsm.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory() && recursive) {
        // Recursively scan subdirectories
        const subdirResults = await scanDirectory(fullPath, recursive);
        results.push(...subdirResults);
      } else if (entry.isFile()) {
        // Process file if it's an image
        const imageInfo = await getImageInfo(fullPath);
        if (imageInfo) {
          results.push(imageInfo);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error);
  }
  
  return results;
}

/**
 * Format size in bytes to a human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format image info as a human-readable string
 */
export function formatImageInfo(image: ImageInfo, basePath: string = ''): string {
  const dimensions = image.width && image.height ? `${image.width}x${image.height}` : "Unknown dimensions";
  const fileSize = formatBytes(image.size);
  const relPath = basePath ? path.relative(basePath, image.path) : image.path;
  
  return `${relPath} - ${dimensions} - ${fileSize}${image.type ? ` - ${image.type}` : ''}`;
}

/**
 * Generate a summary of found images
 */
export function generateImageSummary(images: ImageInfo[], dirPath: string, recursive: boolean): string {
  const totalSize = images.reduce((sum, image) => sum + image.size, 0);
  const formattedResults = images.map(image => formatImageInfo(image, dirPath));
  
  return [
    `Found ${images.length} images in ${dirPath}${recursive ? " (including subdirectories)" : ""}`,
    `Total size: ${formatBytes(totalSize)}`,
    "\nImage details:",
    ...formattedResults
  ].join("\n");
}

/**
 * Capture console logs from a website
 */
export async function captureConsoleLogs(
  url: string, 
  waitTimeMs: number = 10000
): Promise<ConsoleLogEntry[]> {
  console.error(`Launching headless browser to capture logs from ${url}...`);
  
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Collect console logs
  const consoleLogs: ConsoleLogEntry[] = [];
  page.on('console', msg => {
    consoleLogs.push({ 
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date()
    });
  });

  try {
    // Navigate to the specified URL
    console.error(`Navigating to ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Wait for the specified time to collect any additional logs
    console.error(`Waiting for ${waitTimeMs / 1000} seconds to collect logs...`);
    await new Promise(resolve => setTimeout(resolve, waitTimeMs));
    
    return consoleLogs;
  } catch (error) {
    console.error('Error navigating with Puppeteer:', error);
    return consoleLogs;
  } finally {
    // Close the browser
    await browser.close();
    console.error('Browser closed');
  }
}

// Create server instance
const server = new McpServer({
  name: "image-size-and-console-logs",
  version: "1.0.0",
  capabilities: {
    resources: {
      image: {
        description: "Image files in a directory, with metadata (path, width, height, type, size)",
        fields: {
          path: { type: "string", description: "Absolute file path" },
          width: { type: "number", description: "Image width in pixels", optional: true },
          height: { type: "number", description: "Image height in pixels", optional: true },
          type: { type: "string", description: "Image type (e.g., png, jpg)", optional: true },
          size: { type: "number", description: "File size in bytes" },
        },
        list: async ({ directory = "./", recursive = false }) => {
          // Convert to absolute path if it's not already
          const absoluteDir = path.isAbsolute(directory) ? directory : path.resolve(directory);
          return await scanDirectory(absoluteDir, recursive);
        },
        params: {
          directory: { 
            type: "string", 
            default: "./", 
            description: "Directory path to scan (relative paths will be converted to absolute)" 
          },
          recursive: { 
            type: "boolean", 
            default: false, 
            description: "Whether to scan subdirectories recursively" 
          },
        },
      },
      consoleLogs: {
        description: "Console logs captured from a website",
        fields: {
          type: { type: "string", description: "Log type (log, warn, error, etc.)" },
          text: { type: "string", description: "Log message content" },
          timestamp: { type: "string", description: "When the log was captured" }
        },
        list: async ({ url = "http://localhost:3000", waitTimeMs = 10000 }) => {
          const logs = await captureConsoleLogs(url, waitTimeMs);
          // Convert Date objects to strings for MCP compatibility
          return logs.map(log => ({
            ...log,
            timestamp: log.timestamp.toISOString()
          }));
        },
        params: {
          url: {
            type: "string",
            default: "http://localhost:3000",
            description: "URL to visit and capture console logs from"
          },
          waitTimeMs: {
            type: "number",
            default: 10000,
            description: "Time to wait in milliseconds after page load before returning logs"
          }
        }
      }
    },
    tools: {},
  },
});

// Common parameters for tools
const directoryParam = z.string().default("./")
  .describe("Absolute directory path. MAKE SURE TO USE ABSOLUTE PATHS!")
  .transform(dir => path.isAbsolute(dir) ? dir : path.resolve(dir));
const recursiveParam = z.boolean().default(false).describe("Whether to scan subdirectories recursively");

// Register the list-images tool
server.tool(
  "list-images",
  "List image files in the specified directory (with optional metadata)",
  {
    directory: directoryParam,
    recursive: recursiveParam,
    withMetadata: z.boolean().default(false).describe("Return image metadata (width, height, type, size) if true, else just file paths"),
  },
  async ({ directory, recursive, withMetadata }) => {
    try {
      // Directory is already converted to absolute path by the Zod transform
      const dirPath = directory;
      
      const images = await scanDirectory(dirPath, recursive);
      
      if (images.length === 0) {
        return {
          content: [
            { type: "text", text: `No images found in ${dirPath}${recursive ? " (including subdirectories)" : ""}.` },
          ],
        };
      }
      
      const data = withMetadata ? images : images.map(img => img.path);
      
      return {
        content: [
          { type: "text", text: JSON.stringify(data, null, 2) }
        ]
      };
    } catch (error) {
      console.error("Error in list-images:", error);
      return {
        content: [
          { type: "text", text: `Error scanning directory: ${error.message}` },
        ],
      };
    }
  }
);

// Register the capture-console-logs tool
server.tool(
  "capture-console-logs",
  "Capture browser console logs from a specified website",
  {
    url: z.string().default("http://localhost:3000").describe("URL to visit and capture console logs from"),
    waitTimeMs: z.number().default(10000).describe("Time to wait in milliseconds after page load before returning logs"),
    formatOutput: z.boolean().default(true).describe("Format the output as human-readable text if true, else return JSON")
  },
  async ({ url, waitTimeMs, formatOutput }) => {
    try {
      const logs = await captureConsoleLogs(url, waitTimeMs);
      
      if (logs.length === 0) {
        return {
          content: [
            { type: "text", text: `No console logs captured from ${url}.` },
          ],
        };
      }
      
      if (formatOutput) {
        // Format logs as human-readable text
        const formattedLogs = logs.map(log => 
          `[${log.timestamp.toISOString()}] ${log.type.toUpperCase()}: ${log.text}`
        ).join('\n');
        
        return {
          content: [
            { type: "text", text: `Captured ${logs.length} console logs from ${url}:\n\n${formattedLogs}` }
          ]
        };
      } else {
        // Return logs as JSON
        const jsonLogs = logs.map(log => ({
          ...log,
          timestamp: log.timestamp.toISOString()
        }));
        
        return {
          content: [
            { type: "text", text: JSON.stringify(jsonLogs, null, 2) }
          ]
        };
      }
    } catch (error) {
      console.error("Error in capture-console-logs:", error);
      return {
        content: [
          { type: "text", text: `Error capturing console logs: ${error.message}` },
        ],
      };
    }
  }
);

// Register the run-local-server tool
server.tool(
  "run-local-server",
  "Run a local static file server and capture console logs from browsers visiting it",
  {
    port: z.number().default(3000).describe("Port to run the server on"),
    directory: directoryParam,
    waitTimeMs: z.number().default(10000).describe("Time to wait in milliseconds after page load before returning logs")
  },
  async ({ port, directory, waitTimeMs }) => {
    // This promise resolves after the server is shut down
    return new Promise((resolve) => {
      const httpServer = http.createServer((req, res) => {
        // Parse the URL
        const parsedUrl = url.parse(req.url, true);
        let pathname = parsedUrl.pathname || '/';

        // If path is '/', serve index.html if it exists, otherwise directory listing
        if (pathname === '/') {
          const indexPath = path.join(directory, 'index.html');
          if (fs.existsSync(indexPath)) {
            pathname = '/index.html';
          } else {
            // Simple directory listing
            try {
              const files = fs.readdirSync(directory);
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <head><title>Directory Listing</title></head>
                  <body>
                    <h1>Directory Listing</h1>
                    <ul>
                      ${files.map(file => `<li><a href="/${file}">${file}</a></li>`).join('')}
                    </ul>
                    <script>
                      console.log('Browser console log: Page loaded at', new Date().toISOString());
                      console.log('Directory listing rendered with ${files.length} files');
                    </script>
                  </body>
                </html>
              `);
              return;
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end(`500 Internal Server Error: ${err instanceof Error ? err.message : err}`);
              return;
            }
          }
        }

        const filePath = path.join(directory, pathname);

        fs.stat(filePath, (err, stats) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
          }
          if (stats.isDirectory()) {
            try {
              const files = fs.readdirSync(filePath);
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <head><title>Directory Listing - ${pathname}</title></head>
                  <body>
                    <h1>Directory Listing - ${pathname}</h1>
                    <ul>
                      <li><a href="${pathname === '/' ? '' : pathname}/..">..</a></li>
                      ${files.map(file => `<li><a href="${path.join(pathname, file)}">${file}</a></li>`).join('')}
                    </ul>
                    <script>
                      console.log('Browser console log: Directory page loaded at', new Date().toISOString());
                      console.log('Subdirectory listing rendered with ${files.length} files');
                    </script>
                  </body>
                </html>
              `);
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end(`500 Internal Server Error: ${err instanceof Error ? err.message : err}`);
            }
            return;
          }
          // Read file and serve it
          fs.readFile(filePath, (err, data) => {
            if (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('500 Internal Server Error');
              return;
            }
            // Get file extension and set content type
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'text/plain';
            switch (ext) {
              case '.html':
                contentType = 'text/html';
                break;
              case '.js':
                contentType = 'text/javascript';
                break;
              case '.css':
                contentType = 'text/css';
                break;
              case '.json':
                contentType = 'application/json';
                break;
              case '.png':
                contentType = 'image/png';
                break;
              case '.jpg':
              case '.jpeg':
                contentType = 'image/jpeg';
                break;
              case '.gif':
                contentType = 'image/gif';
                break;
            }
            // If it's HTML, inject script tag with console.log
            if (contentType === 'text/html') {
              let htmlContent = data.toString();
              if (htmlContent.includes('</body>')) {
                htmlContent = htmlContent.replace('</body>', `
                  <script>
                    console.log('Browser console log: Page "${pathname}" loaded at', new Date().toISOString());
                    console.log('Content type: ${contentType}');
                    console.log('File size: ${stats.size} bytes');
                  </script>
                  </body>
                `);
              } else {
                htmlContent += `
                  <script>
                    console.log('Browser console log: Page "${pathname}" loaded at', new Date().toISOString());
                    console.log('Content type: ${contentType}');
                    console.log('File size: ${stats.size} bytes');
                  </script>
                `;
              }
              data = Buffer.from(htmlContent);
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
          });
        });
      });

      httpServer.listen(port, async () => {
        console.error(`Local server running at http://localhost:${port}/`);

        let logs: ConsoleLogEntry[] = [];
        let errorMsg = '';

        try {
          logs = await captureConsoleLogs(`http://localhost:${port}/`, waitTimeMs);
        } catch (error) {
          errorMsg = error instanceof Error ? error.message : String(error);
        } finally {
          httpServer.close(() => {
            console.error('Local server has been shut down');
            let textOut = '';

            if (errorMsg) {
              textOut = `Error capturing console logs: ${errorMsg}\n\n(HTTP server was properly shut down)`;
            } else {
              const formattedLogs = logs.map(log =>
                `[${log.timestamp.toISOString()}] ${log.type.toUpperCase()}: ${log.text}`
              ).join('\n');
              textOut = `Local server ran on port ${port}, serving directory ${directory}.\n\nCaptured ${logs.length} console logs:\n\n${formattedLogs}`;
            }

            resolve({
              content: [
                {
                  type: "text",
                  text: textOut
                }
              ]
            });
          });
        }
      });
    });
  }
);
// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Image Size and Console Logs MCP Server running on stdio");
}

// Only run the server if this file is being run directly
if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}