'use client';

import { useState } from 'react';
import { Button, Input } from '@org/ui';
import type { TeleRole } from '../schemas/tele';

export function ChatPane({
  chat,
  myRole,
  onSend,
}: {
  chat: Array<{ from: TeleRole; text: string; at: string }>;
  myRole: TeleRole;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };
  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Chat
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {chat.length === 0 && (
          <li className="text-xs text-muted-foreground">No messages yet.</li>
        )}
        {chat.map((m, i) => (
          <li
            key={i}
            className={`max-w-[80%] rounded px-2 py-1 ${
              m.from === myRole
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}
          >
            {m.text}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-1 border-t p-2"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
        />
        <Button type="submit" size="sm">
          Send
        </Button>
      </form>
    </div>
  );
}
