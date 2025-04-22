import * as path from 'path';
import { getImageInfo, scanDirectory, formatBytes } from '../index.js';

describe('Image Size MCP Unit Tests', () => {
  const testImagesDir = path.resolve('test_images');
  
  describe('getImageInfo', () => {
    it('should get image information for a valid image file', async () => {
      const imagePath = path.join(testImagesDir, 'image.png');
      const info = await getImageInfo(imagePath);
      
      expect(info).toBeTruthy();
      expect(info?.path).toBe(imagePath);
      expect(typeof info?.width).toBe('number');
      expect(typeof info?.height).toBe('number');
      expect(info?.type).toBe('png');
      expect(typeof info?.size).toBe('number');
      expect(info?.size).toBeGreaterThan(0);
      console.log('Image Info:', info);
    });

    it('should return null for non-image files', async () => {
      // Create a temporary text file for testing
      const textFilePath = path.join(testImagesDir, 'test.txt');
      const info = await getImageInfo(textFilePath);
      expect(info).toBeNull();
    });

    it('should return null for non-existent files', async () => {
      const nonExistentPath = path.join(testImagesDir, 'nonexistent.png');
      const info = await getImageInfo(nonExistentPath);
      expect(info).toBeNull();
    });
  });

  describe('scanDirectory', () => {
    it('should scan directory and find images', async () => {
      const results = await scanDirectory(testImagesDir, false);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check first image result structure
      const firstImage = results[0];
      expect(firstImage).toHaveProperty('path');
      expect(firstImage).toHaveProperty('width');
      expect(firstImage).toHaveProperty('height');
      expect(firstImage).toHaveProperty('type');
      expect(firstImage).toHaveProperty('size');
    });

    it('should respect recursive flag', async () => {
      const nonRecursiveResults = await scanDirectory(testImagesDir, false);
      const recursiveResults = await scanDirectory(testImagesDir, true);
      
      // At minimum, recursive should find the same files as non-recursive
      expect(recursiveResults.length).toBeGreaterThanOrEqual(nonRecursiveResults.length);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes to human readable string', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatBytes(500)).toBe('500 Bytes');
      expect(formatBytes(1024 * 1.5)).toBe('1.5 KB');
    });
  });
});