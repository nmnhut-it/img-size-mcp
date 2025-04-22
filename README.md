# Image Size MCP Server

This Model Context Protocol (MCP) server provides tools to scan directories for images and report their sizes, dimensions, and formats.

## Features

- Recursively scans directories for image files
- Reports image dimensions, file sizes, and formats
- Works with JPEG, PNG, GIF, BMP, WebP, SVG, TIFF, and ICO files
- Formats file sizes in human-readable format (KB, MB, etc.)

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Build the project:
   ```
   npm run build
   ```

## Usage with Claude for Desktop

1. Open your Claude for Desktop configuration file at:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the server configuration:

```json
{
    "mcpServers": {
        "image-size": {
            "command": "node",
            "args": [
                "/ABSOLUTE/PATH/TO/YOUR/FOLDER/build/index.js"
            ]
        }
    }
}
```

Replace `/ABSOLUTE/PATH/TO/YOUR/FOLDER/` with the actual path to this project's folder.

3. Restart Claude for Desktop

4. Look for the hammer icon in Claude for Desktop, which indicates available tools. You should see the "get-image-sizes" tool.

## Available Tools

### get-image-sizes

Gets information about images in a specified directory.

**Parameters:**
- `directory` (string, optional): The directory to scan. Defaults to the current directory (`./`).
- `recursive` (boolean, optional): Whether to scan subdirectories recursively. Defaults to `true`.

**Example usage in Claude:**
- "Scan the current directory for images and show me their sizes"
- "Get image dimensions in the /Users/username/Pictures folder"

## Troubleshooting

- Make sure the build step has been completed
- Check that the path in your `claude_desktop_config.json` is correct and absolute
- Verify the server shows up in the tools menu in Claude for Desktop (hammer icon)
- Look at the Claude for Desktop logs for any error messages

## Development

To modify the server:

1. Edit the source files in the `src` directory
2. Rebuild the project with `npm run build`
3. Restart Claude for Desktop to pick up the changes
