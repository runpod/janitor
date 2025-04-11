import { createTool } from "@mastra/core/tools";
import { execSync } from "child_process";
import { promises as fs } from "fs";
import * as glob from "glob";
import path from "path";
import { z } from "zod";

/**
 * Read file content with optional offset and limit
 */
export const readFileContent = async (
	filePath: string,
	offset = 0,
	limit = -1
): Promise<{
	success: boolean;
	content?: string;
	error?: string;
	lineCount?: number;
}> => {
	try {
		// Resolve the file path to handle both absolute and relative paths
		const resolvedPath = path.resolve(filePath);
		console.log(`Reading file: ${resolvedPath}`);

		// Check if file exists
		try {
			await fs.access(resolvedPath);
		} catch (error) {
			return {
				success: false,
				error: `File does not exist or is not accessible: ${resolvedPath}`,
			};
		}

		// Read file content
		const content = await fs.readFile(resolvedPath, "utf8");
		const lines = content.split("\n");
		const lineCount = lines.length;

		// Apply offset and limit if specified
		if (offset > 0 || limit > 0) {
			const startIndex = Math.max(0, offset);
			const endIndex = limit > 0 ? Math.min(lineCount, startIndex + limit) : lineCount;
			const selectedLines = lines.slice(startIndex, endIndex);

			return {
				success: true,
				content: selectedLines.join("\n"),
				lineCount,
			};
		}

		return {
			success: true,
			content,
			lineCount,
		};
	} catch (error: any) {
		console.error(`Error reading file: ${error.message}`);
		return {
			success: false,
			error: `Failed to read file: ${error.message}`,
		};
	}
};

/**
 * List contents of a directory with optional recursive mode
 */
export const listDirectory = async (
	dirPath: string,
	recursive = false,
	depth = 1
): Promise<{
	success: boolean;
	files?: Array<{
		name: string;
		type: "file" | "directory";
		size?: number;
		modifiedTime?: Date;
		path: string;
	}>;
	error?: string;
}> => {
	try {
		// Resolve the directory path to handle both absolute and relative paths
		const resolvedPath = path.resolve(dirPath);
		console.log(`Listing directory: ${resolvedPath}, recursive: ${recursive}, depth: ${depth}`);

		// Check if directory exists
		try {
			const stats = await fs.stat(resolvedPath);
			if (!stats.isDirectory()) {
				return {
					success: false,
					error: `Path is not a directory: ${resolvedPath}`,
				};
			}
		} catch (error) {
			return {
				success: false,
				error: `Directory does not exist or is not accessible: ${resolvedPath}`,
			};
		}

		// Platform-specific directory listing for better performance on large directories
		if (recursive && process.platform !== "win32" && depth > 1) {
			try {
				// On Linux/Unix, use find for faster recursive listing
				const maxDepth = depth < 0 ? "" : `-maxdepth ${depth}`;
				const output = execSync(
					`find "${resolvedPath}" ${maxDepth} -type f -o -type d 2>/dev/null`,
					{ encoding: "utf8" }
				);

				const entries = output.split("\n").filter(Boolean);
				const result = await Promise.all(
					entries.map(async entryPath => {
						try {
							const stats = await fs.stat(entryPath);
							const relativePath = path.relative(resolvedPath, entryPath);
							return {
								name: path.basename(entryPath),
								type: stats.isDirectory()
									? ("directory" as const)
									: ("file" as const),
								size: stats.isFile() ? stats.size : undefined,
								modifiedTime: stats.mtime,
								path: relativePath,
							};
						} catch (error) {
							return null;
						}
					})
				);

				return {
					success: true,
					files: result.filter(Boolean) as any[],
				};
			} catch (error) {
				// Fallback to manual recursive listing if find command fails
				console.log("Find command failed, falling back to manual recursion");
			}
		}

		// Manual directory listing
		const entries = await fs.readdir(resolvedPath);
		const result = await Promise.all(
			entries.map(async entry => {
				const entryPath = path.join(resolvedPath, entry);
				try {
					const stats = await fs.stat(entryPath);
					const item = {
						name: entry,
						type: stats.isDirectory() ? ("directory" as const) : ("file" as const),
						size: stats.isFile() ? stats.size : undefined,
						modifiedTime: stats.mtime,
						path: entry,
					};

					// Handle recursive listing
					if (recursive && stats.isDirectory() && (depth < 0 || depth > 1)) {
						const subResult = await listDirectory(
							entryPath,
							true,
							depth < 0 ? -1 : depth - 1
						);

						if (subResult.success && subResult.files) {
							// Add subdirectory files with updated paths
							const subItems = subResult.files.map(subItem => ({
								...subItem,
								path: path.join(entry, subItem.path),
							}));

							return [item, ...subItems];
						}
					}

					return item;
				} catch (error) {
					console.error(`Error processing entry ${entry}: ${error}`);
					return null;
				}
			})
		);

		// Flatten and filter the results
		const flattenedResult = result.flat().filter(Boolean) as Array<{
			name: string;
			type: "file" | "directory";
			size?: number;
			modifiedTime?: Date;
			path: string;
		}>;

		return {
			success: true,
			files: flattenedResult,
		};
	} catch (error: any) {
		console.error(`Error listing directory: ${error.message}`);
		return {
			success: false,
			error: `Failed to list directory: ${error.message}`,
		};
	}
};

/**
 * Search for files using glob patterns
 */
export const searchFiles = async (
	searchPath: string,
	pattern: string,
	excludePattern?: string
): Promise<{
	success: boolean;
	files?: string[];
	error?: string;
}> => {
	try {
		// Resolve the search path to handle both absolute and relative paths
		const resolvedPath = path.resolve(searchPath);
		console.log(
			`Searching for files: pattern=${pattern}, exclude=${
				excludePattern || "none"
			}, path=${resolvedPath}`
		);

		// Check if directory exists
		try {
			const stats = await fs.stat(resolvedPath);
			if (!stats.isDirectory()) {
				return {
					success: false,
					error: `Search path is not a directory: ${resolvedPath}`,
				};
			}
		} catch (error) {
			return {
				success: false,
				error: `Search directory does not exist or is not accessible: ${resolvedPath}`,
			};
		}

		// Prepare glob options
		const options: glob.GlobOptions = {
			cwd: resolvedPath,
			absolute: false, // Return relative paths
			dot: true, // Include dotfiles
			ignore: excludePattern ? [excludePattern] : undefined,
		};

		// Use glob to find files
		const matchedPaths = await glob.glob(pattern, options);
		const files = matchedPaths.map(p => p.toString());

		return {
			success: true,
			files,
		};
	} catch (error: any) {
		console.error(`Error searching for files: ${error.message}`);
		return {
			success: false,
			error: `Failed to search for files: ${error.message}`,
		};
	}
};

/**
 * Edit file content (create, modify, or delete)
 */
export const editFileContent = async (
	filePath: string,
	content: string | null,
	createIfNotExists = true
): Promise<{
	success: boolean;
	error?: string;
	created?: boolean;
	modified?: boolean;
	deleted?: boolean;
}> => {
	try {
		// Resolve the file path to handle both absolute and relative paths
		const resolvedPath = path.resolve(filePath);
		console.log(`Editing file: ${resolvedPath}`);

		// Check if file exists
		let fileExists = false;
		try {
			await fs.access(resolvedPath);
			fileExists = true;
		} catch (error) {
			fileExists = false;
		}

		// Handle file deletion
		if (content === null) {
			if (!fileExists) {
				return {
					success: true,
					deleted: false,
					error: `File does not exist: ${resolvedPath}`,
				};
			}

			await fs.unlink(resolvedPath);
			return {
				success: true,
				deleted: true,
			};
		}

		// Handle file creation or modification
		if (!fileExists && !createIfNotExists) {
			return {
				success: false,
				modified: false,
				error: `File does not exist and createIfNotExists is false: ${resolvedPath}`,
			};
		}

		// Create parent directories if they don't exist
		const dirPath = path.dirname(resolvedPath);
		try {
			await fs.mkdir(dirPath, { recursive: true });
		} catch (error) {
			console.error(`Error creating directory: ${error}`);
		}

		// Write file content
		await fs.writeFile(resolvedPath, content, "utf8");

		return {
			success: true,
			created: !fileExists,
			modified: fileExists,
		};
	} catch (error: any) {
		console.error(`Error editing file: ${error.message}`);
		return {
			success: false,
			error: `Failed to edit file: ${error.message}`,
		};
	}
};

/**
 * Create a directory recursively if it doesn't exist
 */
export const createDirectory = async (
	dirPath: string
): Promise<{
	success: boolean;
	path?: string;
	error?: string;
}> => {
	try {
		const resolvedPath = path.resolve(dirPath);
		console.log(`Creating directory: ${resolvedPath}`);

		// Check if it already exists and is a directory
		try {
			const stats = await fs.stat(resolvedPath);
			if (stats.isDirectory()) {
				return {
					success: true,
					path: resolvedPath,
					error: "Directory already exists.", // Not strictly an error, but informational
				};
			}
			// If it exists but is not a directory, it's an error
			return {
				success: false,
				error: `Path exists but is not a directory: ${resolvedPath}`,
			};
		} catch (error: any) {
			// If stat fails, it likely doesn't exist, which is expected
			if (error.code !== "ENOENT") {
				throw error; // Re-throw unexpected errors
			}
		}

		// Create the directory recursively
		await fs.mkdir(resolvedPath, { recursive: true });
		console.log(`Directory created successfully: ${resolvedPath}`);

		return {
			success: true,
			path: resolvedPath,
		};
	} catch (error: any) {
		console.error(`Error creating directory: ${error.message}`);
		return {
			success: false,
			error: `Failed to create directory: ${error.message}`,
		};
	}
};

export const read_file = createTool({
	id: "read_file",
	inputSchema: z.object({
		filePath: z.string().describe("Path to the file to read"),
		offset: z.number().optional().describe("Line number to start reading from (0-based)"),
		limit: z.number().optional().describe("Maximum number of lines to read"),
	}),
	description: "Reads file content with optional line range limits",
	execute: async ({ context }) => {
		const result = await readFileContent(
			context.filePath,
			context.offset || 0,
			context.limit || -1
		);

		return result;
	},
});

export const list_files = createTool({
	id: "list_files",
	inputSchema: z.object({
		dirPath: z.string().describe("Path to the directory to list"),
		recursive: z.boolean().optional().describe("Whether to list subdirectories recursively"),
		depth: z.number().optional().describe("Maximum depth for recursive listing"),
	}),
	description: "Lists contents of a directory with file metadata",
	execute: async ({ context }) => {
		const result = await listDirectory(
			context.dirPath,
			context.recursive || false,
			context.depth || 1
		);

		return result;
	},
});

export const search = createTool({
	id: "search",
	inputSchema: z.object({
		searchPath: z.string().describe("Base path to search in"),
		pattern: z
			.string()
			.describe("Glob pattern to match files (e.g., '**/*.js', 'Dockerfile*')"),
		excludePattern: z
			.string()
			.optional()
			.describe("Glob pattern to exclude (e.g., 'node_modules/**')"),
	}),
	description: "Searches for files matching a pattern",
	execute: async ({ context }) => {
		const result = await searchFiles(
			context.searchPath,
			context.pattern,
			context.excludePattern
		);

		return result;
	},
});

export const edit_file = createTool({
	id: "edit_file",
	inputSchema: z.object({
		filePath: z.string().describe("Path to the file to edit"),
		content: z.string().nullable().describe("New content (or null to delete the file)"),
		createIfNotExists: z
			.boolean()
			.optional()
			.describe("Whether to create the file if it doesn't exist"),
	}),
	description: "Creates, modifies, or deletes a file",
	execute: async ({ context }) => {
		const result = await editFileContent(
			context.filePath,
			context.content,
			context.createIfNotExists ?? true
		);

		return result;
	},
});

export const create_directory = createTool({
	id: "create_directory",
	inputSchema: z.object({
		dirPath: z.string().describe("Path to the directory to create"),
	}),
	description: "Creates a directory, including any necessary parent directories.",
	execute: async ({ context }) => {
		const result = await createDirectory(context.dirPath);
		return result;
	},
});

/**
 * Move or rename a file or directory
 */
export const moveFileOrDirectory = async (
	sourcePath: string,
	destinationPath: string
): Promise<{
	success: boolean;
	error?: string;
}> => {
	const resolvedSource = path.resolve(sourcePath);
	const resolvedDestination = path.resolve(destinationPath);
	console.log(`Moving/Renaming from ${resolvedSource} to ${resolvedDestination}`);

	try {
		// Check if source exists
		try {
			await fs.access(resolvedSource);
		} catch (error) {
			return {
				success: false,
				error: `Source path does not exist or is not accessible: ${resolvedSource}`,
			};
		}

		// Ensure destination directory exists
		const destDir = path.dirname(resolvedDestination);
		await fs.mkdir(destDir, { recursive: true });

		// Perform the move/rename operation
		await fs.rename(resolvedSource, resolvedDestination);

		console.log(`Successfully moved/renamed ${resolvedSource} to ${resolvedDestination}`);
		return { success: true };
	} catch (error: any) {
		console.error(`Error moving/renaming file/directory: ${error.message}`);
		return {
			success: false,
			error: `Failed to move/rename: ${error.message}`,
		};
	}
};

export const move_file = createTool({
	id: "move_file",
	inputSchema: z.object({
		sourcePath: z
			.string()
			.describe("The current path of the file or directory to move/rename."),
		destinationPath: z.string().describe("The new path for the file or directory."),
	}),
	description: "Moves or renames a file or directory.",
	execute: async ({ context }) => {
		const result = await moveFileOrDirectory(context.sourcePath, context.destinationPath);
		return result;
	},
});
