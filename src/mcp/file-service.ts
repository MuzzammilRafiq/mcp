// file-service.ts:
import { promises as fs } from "fs";
import { dirname } from "path";

export interface WriteFileOptions {
  path: string;
  content: string;
  createDirectories?: boolean;
}

export async function writeFileService(
  options: WriteFileOptions
): Promise<{ success: boolean; message: string; path: string }> {
  try {
    const { path, content, createDirectories = true } = options;

    // Create directories if they don't exist and createDirectories is true
    if (createDirectories) {
      const dir = dirname(path);
      await fs.mkdir(dir, { recursive: true });
    }

    // Write the file
    await fs.writeFile(path, content, "utf8");

    return {
      success: true,
      message: `File successfully written to ${path}`,
      path: path,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to write file: ${error.message}`,
      path: options.path,
    };
  }
}

export async function readFileService(
  path: string
): Promise<{ success: boolean; content?: string; message: string }> {
  try {
    const content = await fs.readFile(path, "utf8");
    return {
      success: true,
      content: content,
      message: `File successfully read from ${path}`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to read file: ${error.message}`,
    };
  }
}
