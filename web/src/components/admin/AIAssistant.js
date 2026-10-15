'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MessageCircleQuestion, X, Send, Sparkles, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const SUGGESTIONS = [
  'How is occupancy looking this week?',
  'Show today’s arrivals',
  'What is my revenue this month?',
  'Which rooms are free tonight?',
];

function renderAnswer(text) {
  // split on markdown-ish bullets and bold
  return String(text || '')
    .split('\n')
    .map((line, i) => (
      <p key={i} className={clsx('text-[13.5px] leading-relaxed text-ink-700', line.trim() === '' ? 'h-2' : 'mb-1')}>
        {line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={j} className="font-semibold text-ink-900">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return (
              <em key={j}>{part.slice(1, -1)}</em>
            );
          }
          return <span key={j}>{part}</span>;
        })}
      </p>
    ));
}

export default function AIAssistant() {
  const { user, isSuper } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hi! I’m HotelHub AI. Ask me about occupancy, revenue, arrivals, or what needs attention today.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user || isSuper) return null;

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content }]);
    setBusy(true);
    try {
      const data = await api.post('/ai/chat', { message: content });
      setMessages((m) => [...m, { role: 'assistant', content: data.reply || data.answer || 'I couldn’t compute that.' }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry — ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-glow transition-transform active:scale-95',
          open ? 'bg-ink-900' : 'gradient-brand'
        )}
        aria-label="AI concierge"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[min(560px,calc(100vh-8rem))] w-[min(400px,calc(100vw-2.5rem))] animate-scale-in flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
          <div className="gradient-brand flex items-center gap-3 px-5 py-4 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="text-sm font-bold">HotelHub AI Concierge</p>
              <p className="text-[11.5px] text-white/70">Live property intelligence</p>
            </div>
          </div>

          <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto bg-ink-50 px-4 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={clsx(
                  'flex',
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={clsx(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-soft',
                    m.role === 'user'
                      ? 'rounded-br-md bg-brand-600 text-white'
                      : 'rounded-bl-md border border-ink-100 bg-white'
                  )}
                >
                  {m.role === 'assistant' ? renderAnswer(m.content) : <p className="text-[13.5px] leading-relaxed">{m.content}</p>}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-ink-100 bg-white px-3.5 py-2.5 text-[13px] text-ink-500 shadow-soft">
                  <Loader2 size={14} className="animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 border-t border-ink-100 px-3 pt-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink-600 transition hover:border-brand-300 hover:text-brand-600"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-ink-100 bg-white px-3 py-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your hotel…"
              className="input flex-1 !py-2"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
