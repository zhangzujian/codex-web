type FileWithPath = {
  path?: unknown;
};

export function getPathForFile(file: FileWithPath): string | null {
  const path = file.path;
  if (typeof path !== "string") {
    return null;
  }

  return path ? path : null;
}
