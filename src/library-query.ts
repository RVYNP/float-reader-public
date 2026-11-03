import type { LibraryDocument } from './catalog-types';

export function searchText(document: LibraryDocument): string {
  return [document.name, document.path, document.notes, ...document.tags, document.source?.repository, document.source?.sourcePath]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

export function isImage(document: LibraryDocument): boolean {
  return ['png', 'jpeg', 'jpg', 'webp', 'gif', 'avif', 'bmp'].includes(document.format.toLowerCase());
}
