"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Note = {
  id: string;
  name: string;
  text: string;
  image: string | null;
  createdAt: number;
};

const COLORS = ["yellow", "pink", "blue", "green", "orange"] as const;

function hashId(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Downscale + compress an image file in the browser before it's sent up,
// so the JSON store (and the page) never has to deal with huge photos.
function fileToCompressedDataUrl(file: File, maxDim = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function FamilyBoard() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      // stay quiet on background poll failures; only surface on first load
      setStatus((s) => (loaded ? s : { text: "Couldn't load the board.", error: true }));
    } finally {
      setLoaded(true);
    }
  }, [loaded]);

  useEffect(() => {
    fetchNotes();
    const interval = setInterval(fetchNotes, 4000); // simple live-ish refresh
    return () => clearInterval(interval);
  }, [fetchNotes]);

  useEffect(() => {
    if (!open) return;
    setName(localStorage.getItem("familyBoardName") || "");
    setText("");
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus({ text: "Please choose an image file.", error: true });
      return;
    }
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setImagePreview(dataUrl);
    } catch {
      setStatus({ text: "Couldn't read that image.", error: true });
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    const trimmedText = text.trim();
    if (!trimmedName || !trimmedText) {
      setStatus({ text: "Please add your name and a note.", error: true });
      return;
    }
    setSaving(true);
    try {
      localStorage.setItem("familyBoardName", trimmedName);
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, text: trimmedText, image: imagePreview }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      setStatus(null);
      setOpen(false);
      fetchNotes();
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Couldn't save that note.", error: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setStatus({ text: "Couldn't remove that note.", error: true });
      fetchNotes();
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Our Family Board</h1>
        <p>Leave a note and keep everyone updated!</p>
      </header>

      {status && (
        <div className={`status ${status.error ? "status-error" : ""}`}>{status.text}</div>
      )}

      <div className="board">
        {loaded && notes.length === 0 && (
          <div className="empty">No notes yet — be the first to stick one up!</div>
        )}
        {notes.map((note) => {
          const h = hashId(note.id);
          const color = COLORS[h % COLORS.length];
          const rotation = (h % 13) - 6;
          return (
            <div
              key={note.id}
              className={`note note-${color}`}
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <button
                className="note-del"
                title="Remove note"
                onClick={() => handleDelete(note.id)}
              >
                ✕
              </button>
              {note.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="note-image" src={note.image} alt="" />
              )}
              <div className="note-text">{note.text}</div>
              <div className="note-author">— {note.name}</div>
            </div>
          );
        })}
      </div>

      <button className="add-btn" title="Add a note" onClick={() => setOpen(true)}>
        +
      </button>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal">
            <h2>New note</h2>

            <label htmlFor="nameInput">Your name</label>
            <input
              id="nameInput"
              type="text"
              maxLength={40}
              placeholder="e.g. Mum"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label htmlFor="textInput">Your note</label>
            <textarea
              id="textInput"
              maxLength={500}
              placeholder="Write something..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <label htmlFor="imageInput">Add a photo (optional)</label>
            <input
              id="imageInput"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
            />
            {imagePreview && (
              <div className="preview-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="preview" src={imagePreview} alt="Preview" />
                <button
                  type="button"
                  className="preview-remove"
                  onClick={() => {
                    setImagePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  Remove photo
                </button>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-cancel" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-save" disabled={saving} onClick={handleSave}>
                {saving ? "Sticking..." : "Stick it up"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}