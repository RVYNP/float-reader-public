//! Indexes a user-chosen folder of PDFs into the library. Files are never copied:
//! each record resolves through the folder's source root plus its relative path.
use crate::{
    catalog::merge_import,
    state::{Collection, Library, LibraryDocument, Provenance, SourceRoot},
};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
};

const MAX_PDFS: usize = 4096;
const MAX_PENDING_DIRS: usize = 4096;

/// A read-only snapshot of one folder, ready to merge into the library.
pub struct FolderIndex {
    /// Canonical folder path; authorized once the index is committed.
    pub root: PathBuf,
    pub root_collection: String,
    pub source: String,
    pub library: Library,
}

fn safe_relative(path: &str) -> bool {
    !path.is_empty() && !path.contains(['\\', ':', '\0']) && path.split('/').all(|p| !p.is_empty() && p != "." && p != ".." && !p.ends_with(['.', ' ']) && !p.chars().any(|c| c.is_control() || "<>\"|?*".contains(c)))
}

/// Canonical Windows paths carry a verbatim prefix that is noise in the UI.
fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") { format!(r"\\{unc}") }
    else { text.strip_prefix(r"\\?\").unwrap_or(&text).to_string() }
}

fn root_id(canonical: &Path) -> String {
    let digest = Sha256::digest(canonical.to_string_lossy().as_bytes());
    let hex: String = digest.iter().take(8).map(|byte| format!("{byte:02x}")).collect();
    format!("folder:{hex}")
}

/// '/'-joined path of `path` below `root`, or None for anything that is not a plain relative path.
fn relative_path(root: &Path, path: &Path) -> Option<String> {
    let parts = path.strip_prefix(root).ok()?.components().map(|component| match component {
        Component::Normal(part) => part.to_str(),
        _ => None,
    }).collect::<Option<Vec<_>>>()?;
    let relative = parts.join("/");
    safe_relative(&relative).then_some(relative)
}

fn find_pdfs(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut walk = vec![root.to_path_buf()];
    let mut seen_dirs = HashSet::new();
    let mut pdfs = Vec::new();
    while let Some(dir) = walk.pop() {
        if !seen_dirs.insert(dir.clone()) { continue; }
        let entries = fs::read_dir(&dir).map_err(|e| format!("Could not read {}: {e}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Could not list {}: {e}", dir.display()))?;
            let path = entry.path();
            // Not followed: symbolic links and junctions report neither directory nor file here.
            let kind = entry.file_type().map_err(|e| format!("Could not inspect {}: {e}", path.display()))?;
            if kind.is_dir() {
                if walk.len() < MAX_PENDING_DIRS { walk.push(path); }
            } else if kind.is_file() && path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
                if pdfs.len() == MAX_PDFS {
                    return Err(format!("This folder contains more than {MAX_PDFS} PDFs, the safe index limit. Choose a narrower folder."));
                }
                pdfs.push(path);
            }
        }
    }
    pdfs.sort();
    Ok(pdfs)
}

/// Walks `folder` for PDFs (case-insensitive). The folder forms one source-owned
/// collection; PDFs below a subfolder are grouped by that first path segment.
pub fn index_folder(folder: &Path) -> Result<FolderIndex, String> {
    let root = fs::canonicalize(folder).map_err(|e| format!("Could not access this folder: {e}"))?;
    if !root.is_dir() { return Err("Choose a folder, not a file.".into()); }
    let id = root_id(&root);
    let source = display_path(&root);
    let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| source.clone());
    let root_collection = format!("{id}:collection");
    let mut collections = vec![Collection { id: root_collection.clone(), name: name.clone(), source_id: Some(id.clone()), ..Collection::default() }];
    let mut groups: HashMap<String, String> = HashMap::new();
    let mut documents = Vec::new();
    for path in find_pdfs(&root)? {
        let Some(relative) = relative_path(&root, &path) else { continue };
        let collection = match relative.split_once('/') {
            None => root_collection.clone(),
            Some((folder, _)) => groups.entry(folder.to_string()).or_insert_with(|| {
                let child = format!("{root_collection}:{folder}");
                collections.push(Collection { id: child.clone(), name: folder.to_string(), parent_id: Some(root_collection.clone()), source_id: Some(id.clone()), ..Collection::default() });
                child
            }).clone(),
        };
        documents.push(LibraryDocument {
            path: format!("{id}:{relative}"),
            name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
            format: "pdf".into(),
            collection_ids: vec![collection],
            source: Some(Provenance {
                source_id: id.clone(),
                record_id: relative.clone(),
                repository: source.clone(),
                source_path: relative.clone(),
                revision: "local".into(),
                root_id: Some(id.clone()),
                relative_path: Some(relative),
                ..Provenance::default()
            }),
            availability: Some("ready".into()),
            ..LibraryDocument::default()
        });
    }
    let library = Library {
        documents,
        collections,
        roots: vec![SourceRoot { id, name, path: Some(root.to_string_lossy().into_owned()), managed: false }],
        imports: vec![],
    };
    Ok(FolderIndex { root, root_collection, source, library })
}

/// Merges an index into `old`. Re-indexing is idempotent and keeps personal organization;
/// PDFs that disappeared stay listed as missing.
pub fn merge(old: &Library, index: &FolderIndex) -> Result<Library, String> {
    if index.library.documents.is_empty() && !old.collections.iter().any(|c| c.id == index.root_collection) {
        return Err(format!("No PDF files were found in {}.", index.source));
    }
    merge_import(old, &index.library, &index.source, "local", &["pdf".into()], &[index.root_collection.clone()])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexes_nested_and_root_pdfs_with_stable_ids() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Papers");
        fs::create_dir_all(root.join("topic/deep")).unwrap();
        fs::create_dir_all(root.join("other")).unwrap();
        fs::create_dir_all(root.join("notes")).unwrap();
        fs::write(root.join("top.pdf"), b"x").unwrap();
        fs::write(root.join("topic/deep/manual.pdf"), b"x").unwrap();
        fs::write(root.join("topic/DECK.PDF"), b"x").unwrap();
        fs::write(root.join("other/brief.pdf"), b"x").unwrap();
        fs::write(root.join("notes/readme.md"), b"x").unwrap();

        let index = index_folder(&root).unwrap();
        let library = &index.library;
        assert_eq!(library.documents.len(), 4);
        assert!(library.documents.iter().all(|d| d.format == "pdf"));
        assert!(library.documents.iter().any(|d| d.name == "DECK.PDF"));
        let names: Vec<_> = library.collections.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names.len(), 3); // Papers + topic + other; notes has no PDF.
        assert!(names.contains(&"Papers") && names.contains(&"topic") && names.contains(&"other"));

        let root_id = &library.roots[0].id;
        assert!(root_id.starts_with("folder:") && root_id.len() == "folder:".len() + 16);
        assert!(!library.roots[0].managed);
        let by_name = |name: &str| library.documents.iter().find(|d| d.name == name).unwrap();
        assert_eq!(by_name("top.pdf").collection_ids, vec![index.root_collection.clone()]);
        let topic = library.collections.iter().find(|c| c.name == "topic").unwrap();
        assert_eq!(topic.parent_id.as_deref(), Some(index.root_collection.as_str()));
        assert_eq!(by_name("manual.pdf").collection_ids, vec![topic.id.clone()]);
        let source = by_name("manual.pdf").source.as_ref().unwrap();
        assert_eq!(source.root_id.as_deref(), Some(root_id.as_str()));
        assert_eq!(source.relative_path.as_deref(), Some("topic/deep/manual.pdf"));
        assert_eq!(by_name("manual.pdf").path, format!("{root_id}:topic/deep/manual.pdf"));

        // The library resolves each record through the authorized folder root.
        let merged = merge(&Library::default(), &index).unwrap();
        let resolved = crate::catalog::resolve_under_root(Path::new(merged.roots[0].path.as_deref().unwrap()), "topic/deep/manual.pdf").unwrap();
        assert_eq!(resolved, fs::canonicalize(root.join("topic/deep/manual.pdf")).unwrap());

        // Re-indexing yields the same identities and does not duplicate records.
        let mut organized = merged.clone();
        organized.documents.iter_mut().find(|d| d.name == "top.pdf").unwrap().favorite = true;
        let again = index_folder(&root).unwrap();
        assert_eq!(again.library.roots[0].id, *root_id);
        let ids = |l: &Library| { let mut ids: Vec<_> = l.documents.iter().map(|d| d.path.clone()).collect(); ids.sort(); ids };
        assert_eq!(ids(&again.library), ids(library));
        let remerged = merge(&organized, &again).unwrap();
        assert_eq!(ids(&remerged), ids(&merged));
        assert_eq!(remerged.collections.len(), merged.collections.len());
        assert_eq!(remerged.roots.len(), 1);
        assert!(remerged.documents.iter().find(|d| d.name == "top.pdf").unwrap().favorite);
    }

    #[test]
    fn empty_folder_is_rejected_until_indexed_and_removed_pdfs_become_missing() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("only.pdf"), b"x").unwrap();
        fs::write(dir.path().join("notes.txt"), b"x").unwrap();
        let empty = tempfile::tempdir().unwrap();
        assert!(merge(&Library::default(), &index_folder(empty.path()).unwrap()).unwrap_err().contains("No PDF"));
        let first = merge(&Library::default(), &index_folder(dir.path()).unwrap()).unwrap();
        fs::remove_file(dir.path().join("only.pdf")).unwrap();
        let second = merge(&first, &index_folder(dir.path()).unwrap()).unwrap();
        assert_eq!(second.documents.len(), 1);
        assert!(second.documents[0].source.as_ref().unwrap().removed);
        assert_eq!(second.documents[0].availability.as_deref(), Some("missing"));
    }

    #[test]
    fn unsafe_relative_paths_are_skipped() {
        assert!(safe_relative("a/b.pdf"));
        for path in ["", "../x.pdf", "a//b.pdf", "a/./b.pdf", "a:b.pdf", "a\\b.pdf", "dot./x.pdf"] { assert!(!safe_relative(path), "{path}"); }
    }
}
