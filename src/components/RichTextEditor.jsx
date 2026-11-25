import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { apiUploadImage } from '../api';
import './RichTextEditor.css';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
}) {
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
    editable: true,
  });

  useEffect(() => {
    if (!editor) return;
    const nextContent = content || '';
    if (nextContent !== editor.getHTML()) {
      editor.commands.setContent(nextContent, false);
    }
  }, [content, editor]);

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;

    setUploadError('');
    if (!ALLOWED_TYPES.has(file.type)) {
      setUploadError('Only PNG, JPEG, WebP, GIF, and AVIF images are allowed.');
      return;
    }

    setUploading(true);
    try {
      const { url } = await apiUploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      setUploadError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  }

  if (!editor) return null;

  return (
    <div className="rich-editor-wrapper">
      <div className="rich-editor-toolbar">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'active' : ''}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'active' : ''}
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'active' : ''}
          title="Strikethrough"
        >
          <s style={{ fontSize: 13 }}>S</s>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'active' : ''}
          title="Underline"
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </button>

        <div className="toolbar-separator" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive('heading', { level: 1 }) ? 'active' : ''}
          title="Heading 1"
          style={{ fontSize: 13, fontWeight: 700 }}
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
          title="Heading 2"
          style={{ fontSize: 12, fontWeight: 700 }}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}
          title="Heading 3"
          style={{ fontSize: 11, fontWeight: 700 }}
        >
          H3
        </button>

        <div className="toolbar-separator" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'active' : ''}
          title="Bullet list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'active' : ''}
          title="Blockquote"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 7L8 11H11V17H5V11L7 7H10ZM18 7L16 11H19V17H13V11L15 7H18Z" /></svg>
        </button>

        <div className="toolbar-separator" />

        <button type="button" className="image-upload-btn" title={uploading ? 'Uploading...' : 'Add image'} disabled={uploading}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={handleImageUpload} disabled={uploading} />
        </button>
      </div>
      {uploadError && (
        <div style={{ color: 'var(--danger)', fontSize: 12, padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
          {uploadError}
        </div>
      )}
      <div className="rich-editor-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
