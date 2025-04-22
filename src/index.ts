// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import * as imageSize from "image-size";

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

/**
 * Get the size of an image file
 */
export async function getImageInfo(filePath: string): Promise<ImageInfo | null> {
  try {
    // Get file stats
    const stats = await fs.stat(filePath);
    
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
        width: dimensions.width,
        height: dimensions.height,
        type: dimensions.type,
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
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
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

// Create server instance
const server = new McpServer({
  name: "image-size",
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
    },
    tools: {},
  },
});

// Common parameters for tools
const directoryParam = z.string().default("./")
  .describe("Absolute directory path to scan (relative paths will be converted to absolute)")
  .transform(dir => path.isAbsolute(dir) ? dir : path.resolve(dir));
const recursiveParam = z.boolean().default(false).describe("Whether to scan subdirectories recursively");

// Register the zps-cocos tool
server.tool(
  "zps-cocos",
  "Get sizes of images in the specified directory",
  {
    directory: directoryParam,
    recursive: recursiveParam,
  },
  async ({ directory, recursive }) => {
    try {
      // Directory is already converted to absolute path by the Zod transform
      const dirPath = directory;
      
      // Scan the directory
      const imageInfos = await scanDirectory(dirPath, recursive);
      
      if (imageInfos.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No images found in ${dirPath}${recursive ? " (including subdirectories)" : ""}.`,
            },
          ],
        };
      }
      
      // Format the results
      const summary = generateImageSummary(imageInfos, dirPath, recursive);
      
      return {
        content: [
          {
            type: "text",
            text: summary,
          },
        ],
      };
    } catch (error) {
      console.error("Error in zps-cocos:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error scanning directory: ${error.message}`,
          },
        ],
      };
    }
  }
);

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

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Image Size MCP Server running on stdio");
}

// Only run the server if this file is being run directly
if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}