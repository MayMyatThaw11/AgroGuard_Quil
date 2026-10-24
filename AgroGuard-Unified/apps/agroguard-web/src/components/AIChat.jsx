import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, Send, Bot, User, Sparkles, PanelLeft, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { API_BASE_URL } from '../api';
import ChatMessageText from './ChatMessageText';
import {
  clearHistory,
  conversationId,
  forgetConversation,
  listConversations,
  loadHistory,
  openConversation,
  rememberConversation,
  startNewConversation,
} from '../lib/chatHistory';
import { getToken } from '../lib/session';

export default function AIChat() {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: t('chat.welcome') }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const conversationRef = useRef(conversationId());
  const [showHistory, setShowHistory] = useState(() => window.innerWidth >= 900);
  const [conversations, setConversations] = useState([]);
  // Use a ref to accumulate streamed text — immune to StrictMode double-calls
  const streamedTextRef = useRef('');

  // Bring back the messages saved for this conversation
  useEffect(() => {
    let alive = true;
    loadHistory(conversationRef.current).then((saved) => {
      if (alive && saved.length > 0) {
        rememberConversation(conversationRef.current);
        setMessages((prev) => [prev[0], ...saved]);
      }
    });
    return () => { alive = false; };
  }, []);

  const resetChat = () => {
    conversationRef.current = startNewConversation();
    setMessages([{ role: 'assistant', content: t('chat.welcome') }]);
  };

  const handleNewChat = () => {
    if (isTyping) return;
    resetChat();
  };

  const [listError, setListError] = useState(false);
  const [activeModel, setActiveModel] = useState('');

  const refreshList = async () => {
    const list = await listConversations(getToken());
    setListError(list === null);
    if (list !== null) setConversations(list);
  };

  useEffect(() => {
    refreshList();
  }, []);

  const handleOpenConversation = async (id) => {
    if (isTyping) return;
    const saved = await loadHistory(id);
    conversationRef.current = id;
    openConversation(id);
    setMessages([{ role: 'assistant', content: t('chat.welcome') }, ...saved]);
  };

  const handleDeleteConversation = async (id) => {
    await clearHistory(id);
    forgetConversation(id);
    setConversations((list) => list.filter((c) => c.conversation_id !== id));
    if (id === conversationRef.current) resetChat();
  };

  // Update welcome message if language changes and it's the only message
  useEffect(() => {
    if (messages.length === 1 && messages[0].role === 'assistant') {
      setMessages([{ role: 'assistant', content: t('chat.welcome') }]);
    }
  }, [language]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isTyping) return;

    rememberConversation(conversationRef.current);
    const userMessage = { role: 'user', content: input };
    const currentMessages = [...messages, userMessage];
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    streamedTextRef.current = '';

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({ 
          messages: currentMessages.map(m => ({ role: m.role, content: m.content })),
          language: language,
          conversation_id: conversationRef.current
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('ReadableStream not supported.');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      // Add the empty assistant message first
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let buffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.content) {
                // Accumulate into a ref (not subject to StrictMode double-calls)
                streamedTextRef.current += data.content;
                const currentText = streamedTextRef.current;
                // Set state with the full accumulated text, not appending
                setMessages(prev => {
                  const updated = prev.slice(0, -1);
                  return [...updated, { role: 'assistant', content: currentText }];
                });
              }
              if (data.done) {
                streamDone = true;
                if (data.provider) setActiveModel(data.provider);
              }
            } catch (parseErr) {
              // skip malformed SSE lines
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: t('chat.error') }]);
    } finally {
      setIsTyping(false);
      refreshList();
    }
  };

  const handleStarter = (question) => {
    setInput(question);
    setTimeout(() => {
      document.getElementById('send-button')?.click();
    }, 100);
  };

  const starters = language === 'my' ? [
    "မြန်မာနိုင်ငံ အပူပိုင်းဇုန်မှာ ဘယ်သီးနှံတွေ အဖြစ်ထွန်းဆုံးလဲ?",
    "မိုးရေချိန်က စပါးအထွက်နှုန်းအပေါ် ဘယ်လိုသက်ရောက်မှုရှိလဲ?",
    "NDVI ဆိုတာဘာလဲ၊ အပင်ကျန်းမာရေးကို ဘယ်လိုတိုင်းတာလဲ?",
    "အက်စစ်ဓာတ်များတဲ့ မြေနဲ့ မိုးများတဲ့နေရာအတွက် သီးနှံအကြံပြုပေးပါ"
  ] : [
    "What crops grow best in Myanmar's dry zone?",
    "How does rainfall affect rice yields?",
    "What is NDVI and how does it measure vegetation health?",
    "Recommend crops for acidic soil with high rainfall"
  ];

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="chat-history-toggle"
            onClick={() => setShowHistory((open) => !open)}
            aria-expanded={showHistory}
            aria-label={t(showHistory ? 'chat.hideHistory' : 'chat.showHistory')}
            title={t(showHistory ? 'chat.hideHistory' : 'chat.showHistory')}
          >
            <PanelLeft size={22} />
          </button>
          <h1 style={{ margin: 0 }}><MessageCircle size={28} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }}/> {t('chat.title')}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <a href="/council" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', backgroundColor: 'rgba(22, 163, 74, 0.1)', border: '1px solid rgba(22, 163, 74, 0.3)', color: '#15803d', borderRadius: '20px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}><span>🌾 Alpha · ⚡ Lou · 💼 Qill Council</span><span style={{ fontSize: '11px', opacity: 0.8 }}>↗</span></a>
          <div className="llm-badge">
            <Sparkles size={14} /> {activeModel ? t('chat.poweredBy', { model: activeModel }) : t('chat.powered')}
          </div>
        </div>
      </div>

      <div className="chat-layout">
      <aside className={`glass-panel chat-history-pane ${showHistory ? 'open' : ''}`} aria-label={t('chat.history')}>
        <h2 className="chat-history-title">{t('chat.historyTitle')}</h2>
        <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={handleNewChat} disabled={isTyping}>
          <Plus size={18} /> {t('chat.newChat')}
        </button>
        <div style={{ borderTop: '1px solid rgba(128,128,128,0.25)', margin: '4px 0' }} />
        {conversations.length === 0 ? (
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.7 }}>{t('chat.noHistory')}</p>
        ) : (
          conversations.map((c) => (
            <div key={c.conversation_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,0.2)' }}>
              <button type="button" onClick={() => handleOpenConversation(c.conversation_id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', color: 'inherit', padding: 0 }}>
                <span style={{ display: 'block', fontWeight: c.conversation_id === conversationRef.current ? 700 : 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                <span style={{ display: 'block', fontSize: '11px', opacity: 0.7 }}>
                  {new Date(c.last_at).toLocaleString(language === 'my' ? 'my-MM' : undefined)} · {t('chat.questions', { count: c.questions })}
                </span>
              </button>
              <button type="button" aria-label={t('chat.deleteChat')} title={t('chat.deleteChat')} onClick={() => handleDeleteConversation(c.conversation_id)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', opacity: 0.7 }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
        {listError && <p role="alert" style={{ margin: 0, fontSize: '13px', color: '#b42318' }}>{t('chat.historyError')}</p>}
      </aside>

      <div className="chat-main">
      <div className="glass-panel chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.role}`}>
            <div className={`message-avatar ${msg.role === 'user' ? 'user-avatar' : 'bot-avatar'}`}>
              {msg.role === 'user' ? <User size={20} color="white" /> : <Bot size={20} color="white" />}
            </div>
            <div className={`message-bubble ${msg.role === 'user' ? 'user-bubble' : 'bot-bubble'} ${isTyping && idx === messages.length - 1 && msg.role === 'assistant' ? 'streaming-cursor' : ''}`}>
              {msg.role === 'assistant' ? <ChatMessageText content={msg.content} /> : msg.content}
            </div>
          </div>
        ))}
        
        {isTyping && messages[messages.length - 1]?.role === 'user' && (
          <div className="chat-message assistant">
            <div className="message-avatar bot-avatar">
              <Bot size={20} color="white" />
            </div>
            <div className="message-bubble bot-bubble typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && (
        <div className="starter-chips">
          {starters.map((q, i) => (
            <button key={i} className="starter-chip" onClick={() => handleStarter(q)}>{q}</button>
          ))}
        </div>
      )}

      <form className="chat-input-container" onSubmit={handleSend}>
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.placeholder')}
          disabled={isTyping}
        />
        <button id="send-button" type="submit" className="btn btn-primary" disabled={!input.trim() || isTyping}>
          <Send size={20} />
        </button>
      </form>
      </div>
      </div>
    </div>
  );
}
