/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Copy, Maximize2, Pickaxe, Droplets, Sprout, Settings, History, FileText, Send, Loader2, Clock, Sparkles, Plus, Trash2, RotateCcw, Trash, PlusCircle, Check, Star, ChevronLeft, ChevronRight, ChevronDown, Calendar, Database, MessageSquare, ArrowLeft, Video, Phone, MoreVertical, Smile, Paperclip, Camera, Mic, Key, Settings2, ZoomIn, ZoomOut, Layout, PanelLeftClose, PanelRightClose, Sun, Moon, Palette, Volume2, User, Search, Archive, Pencil, Image as ImageIcon, FileUp, Globe, Type as TypeIcon, List, AlignLeft, Ruler, Scissors, Zap, Hash, Tags, Target, Activity, Gauge, Heading, Monitor, Smartphone, PanelTop, PanelBottom, Bold, Italic, Strikethrough, Code } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Markdown from 'react-markdown';
import { GoogleGenAI, Type } from "@google/genai";
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { DayPicker, DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

interface CategoryItem {
  id: number;
  name: string;
  parent_id?: number | null;
  header_text?: string | null;
  footer_text?: string | null;
  is_header_active?: number;
  is_footer_active?: number;
}

interface ApiKey {
  id: number;
  name: string;
  api_key: string;
  status: 'available' | 'exhausted' | 'invalid';
  usage_count: number;
  last_used_at: string | null;
  is_active: number;
  sort_order: number;
}

interface PromptTemplate {
  id: number;
  key: string;
  instruction: string;
  label: string;
}

interface NewsItem {
  id: number;
  category_id: number;
  category: string;
  type: 'raw' | 'refined';
  parent_id: number | null;
  raw_text: string;
  summary_en: string | null;
  summary_hi: string | null;
  is_copied?: number;
  created_at: string;
  images?: string[];
}

interface ReportItem {
  id: number;
  category_id: number;
  category: string;
  type: string;
  source_news_ids?: string; // JSON string
  source_mode?: string;
  content_en: string;
  content_hi: string;
  is_copied?: number;
  start_date: string;
  end_date: string;
  created_at: string;
}

const repairMarkdownHF = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.split('\n').map(line => {
    const cleaned = line.trim();
    if (!cleaned) return line;

    // Helper to repair unmatched tag pairs (like **, _, ~~, `)
    const repairTag = (lineStr: string, tag: string): string => {
      let count = 0;
      let pos = lineStr.indexOf(tag);
      while (pos !== -1) {
        count++;
        pos = lineStr.indexOf(tag, pos + tag.length);
      }

      if (count % 2 !== 0) {
        if (lineStr.startsWith(tag)) {
          return lineStr + tag;
        } else if (lineStr.endsWith(tag)) {
          return tag + lineStr;
        }
      }
      return lineStr;
    };

    let triplet = line;
    triplet = repairTag(triplet, '**');
    triplet = repairTag(triplet, '_');
    triplet = repairTag(triplet, '~~');
    triplet = repairTag(triplet, '`');
    return triplet;
  }).join('\n');
};

const mdToHtml = (md: string): string => {
  if (!md) return '';
  // Before converting, let's repair any broken line-by-line formatting
  const repaired = repairMarkdownHF(md);
  
  return repaired.split('\n').map(line => {
    let html = line;
    // Escape HTML characters first to avoid injecting tags
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Formatters (line-by-line)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
    
    return html;
  }).join('<br>');
};

const htmlToMd = (html: string): string => {
  if (!html) return '';
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const traverse = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    
    const el = node as HTMLElement;
    let childrenText = '';
    el.childNodes.forEach(child => {
      childrenText += traverse(child);
    });

    const tag = el.tagName.toLowerCase();
    const style = el.getAttribute('style') || '';

    const isBold = tag === 'strong' || tag === 'b' || style.includes('font-weight: bold') || el.style.fontWeight === 'bold';
    const isItalic = tag === 'em' || tag === 'i' || style.includes('font-style: italic') || el.style.fontStyle === 'italic';
    const isStrike = tag === 'del' || tag === 's' || tag === 'strike' || style.includes('text-decoration: line-through') || el.style.textDecoration === 'line-through' || el.style.textDecorationLine === 'line-through';
    const isCode = tag === 'code' || tag === 'pre' || style.includes('font-family: monospace') || el.style.fontFamily === 'monospace' || (tag === 'font' && el.getAttribute('face') === 'monospace');

    if (tag === 'br') {
      return '\n';
    }
    if (tag === 'div' || tag === 'p') {
      return (childrenText ? '\n' + childrenText : '');
    }

    let wrapped = childrenText;
    if (isBold && wrapped.trim()) {
      wrapped = wrapped.split('\n').map(line => {
        if (!line.trim()) return line;
        const match = line.match(/^(\s*)(.*?)(\s*)$/);
        if (match) {
          const [_, lead, content, trail] = match;
          if (content && !content.startsWith('**') && !content.endsWith('**')) {
            return `${lead}**${content}**${trail}`;
          }
        }
        return line;
      }).join('\n');
    }
    if (isItalic && wrapped.trim()) {
      wrapped = wrapped.split('\n').map(line => {
        if (!line.trim()) return line;
        const match = line.match(/^(\s*)(.*?)(\s*)$/);
        if (match) {
          const [_, lead, content, trail] = match;
          if (content && !content.startsWith('_') && !content.endsWith('_')) {
            return `${lead}_${content}_${trail}`;
          }
        }
        return line;
      }).join('\n');
    }
    if (isStrike && wrapped.trim()) {
      wrapped = wrapped.split('\n').map(line => {
        if (!line.trim()) return line;
        const match = line.match(/^(\s*)(.*?)(\s*)$/);
        if (match) {
          const [_, lead, content, trail] = match;
          if (content && !content.startsWith('~~') && !content.endsWith('~~')) {
            return `${lead}~~${content}~~${trail}`;
          }
        }
        return line;
      }).join('\n');
    }
    if (isCode && wrapped.trim()) {
      wrapped = wrapped.split('\n').map(line => {
        if (!line.trim()) return line;
        const match = line.match(/^(\s*)(.*?)(\s*)$/);
        if (match) {
          const [_, lead, content, trail] = match;
          if (content && !content.startsWith('`') && !content.endsWith('`')) {
            return `${lead}\`${content}\`${trail}`;
          }
        }
        return line;
      }).join('\n');
    }

    return wrapped;
  };

  let result = '';
  tempDiv.childNodes.forEach(child => {
    result += traverse(child);
  });

  return result.replace(/^\n+/, '').replace(/\n+$/, '').trim();
};

interface RichEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  theme?: 'dark' | 'light';
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>; // Kept for layout consistency
}

const RichEditor: React.FC<RichEditorProps> = ({ value, onChange, placeholder = '', theme = 'light' }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isEditing = useRef(false);

  // Convert markdown to HTML once, or when value changes externally (not during editing)
  useEffect(() => {
    if (editorRef.current && !isEditing.current) {
      editorRef.current.innerHTML = mdToHtml(value);
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      isEditing.current = true;
      const html = editorRef.current.innerHTML;
      const markdown = htmlToMd(html);
      onChange(markdown);
    }
  };

  const handleBlur = () => {
    isEditing.current = false;
  };

  const handleFormat = (command: string, arg: string | null = null) => {
    document.execCommand(command, false, arg || undefined);
    handleInput();
  };

  return (
    <div className="flex flex-col space-y-2 w-full">
      <div className="flex items-center space-x-1 p-1 bg-gray-100/60 dark:bg-[#1a1c1e] rounded-lg border border-gray-100/30 dark:border-gray-800/85 w-fit select-none">
        <span className="text-[10px] font-black uppercase text-gray-450 dark:text-gray-500 tracking-wider px-2 border-r border-[#e2e8f0]/40 dark:border-gray-800 mr-1 select-none">Format:</span>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); handleFormat('bold'); }}
          className="p-1 rounded text-gray-650 hover:text-black hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 w-6 h-6 flex items-center justify-center transition-all cursor-pointer"
          title="Bold (B)"
        >
          <Bold size={11} strokeWidth={3} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); handleFormat('italic'); }}
          className="p-1 rounded text-gray-650 hover:text-black hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 w-6 h-6 flex items-center justify-center transition-all cursor-pointer"
          title="Italic (I)"
        >
          <Italic size={11} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); handleFormat('strikeThrough'); }}
          className="p-1 rounded text-gray-650 hover:text-black hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 w-6 h-6 flex items-center justify-center transition-all cursor-pointer"
          title="Strikethrough (S)"
        >
          <Strikethrough size={11} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); handleFormat('fontName', 'monospace'); }}
          className="p-1 rounded text-gray-650 hover:text-black hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 w-6 h-6 flex items-center justify-center transition-all cursor-pointer"
          title="Monospace (Code)"
        >
          <Code size={11} strokeWidth={2.5} />
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onBlur={handleBlur}
        className={`w-full min-h-[96px] p-3 rounded-xl border font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#009f75]/10 transition-all overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-600 block empty:before:pointer-events-none empty:before:italic ${
          theme === 'dark' 
            ? 'bg-[#151719] border-[#2d2f31] text-gray-200 focus:border-[#009f75]' 
            : 'bg-white border-[#dce0e5] text-gray-800 focus:border-[#009f75]'
        }`}
        style={{ whiteSpace: 'pre-wrap' }}
        data-placeholder={placeholder}
      />
    </div>
  );
};

export default function App() {
  const [viewMode, setViewMode] = useState<'intelligence' | 'reports' | 'trash'>('intelligence');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<Record<string, PromptTemplate>>({});
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'api_keys' | 'data'>('api_keys');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});
  const [inputText, setInputText] = useState('');
  const [inputImages, setInputImages] = useState<string[]>([]);
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  const [reportsList, setReportsList] = useState<ReportItem[]>([]);
  const [trashItems, setTrashItems] = useState<{ news: NewsItem[], reports: ReportItem[] }>({ news: [], reports: [] });
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportSource, setReportSource] = useState<'raw' | 'refined' | 'master'>('refined');
  const [newsForReport, setNewsForReport] = useState<NewsItem[]>([]);
  const [selectedNewsIds, setSelectedNewsIds] = useState<Set<number>>(new Set());
  const [starredNewsIds, setStarredNewsIds] = useState<Set<number>>(new Set());
  const [isStarredOnly, setIsStarredOnly] = useState(false);
  const [isEditingNews, setIsEditingNews] = useState<NewsItem | null>(null);
  const [editingNewsContent, setEditingNewsContent] = useState("");
  const [editingNewsImages, setEditingNewsImages] = useState<string[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [expandedNewsIds, setExpandedNewsIds] = useState<Set<number>>(new Set());
  const [isFetchingNewsForReport, setIsFetchingNewsForReport] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isLoadingTrash, setIsLoadingTrash] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [addingToParentId, setAddingToParentId] = useState<number | 'root' | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [isHeaderFooterModalOpen, setIsHeaderFooterModalOpen] = useState(false);
  const [hfEditingCategory, setHfEditingCategory] = useState<CategoryItem | null>(null);
  const [hfHeader, setHfHeader] = useState('');
  const [hfFooter, setHfFooter] = useState('');
  const [isHfHeaderActive, setIsHfHeaderActive] = useState(false);
  const [isHfFooterActive, setIsHfFooterActive] = useState(false);

  const hfHeaderRef = useRef<HTMLTextAreaElement>(null);
  const hfFooterRef = useRef<HTMLTextAreaElement>(null);

  const applyFormatTag = (field: 'header' | 'footer', prefix: string, suffix: string = prefix) => {
    const ref = field === 'header' ? hfHeaderRef : hfFooterRef;
    const value = field === 'header' ? hfHeader : hfFooter;
    const setValue = field === 'header' ? setHfHeader : setHfFooter;
    
    if (!ref.current) {
      setValue(prev => prev + prefix + suffix);
      return;
    }

    const textarea = ref.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    const replacement = prefix + selectedText + suffix;
    const newValue = value.substring(0, start) + replacement + value.substring(end);

    setValue(newValue);

    setTimeout(() => {
      textarea.focus();
      const selectionStart = start + prefix.length;
      const selectionEnd = selectionStart + selectedText.length;
      textarea.setSelectionRange(selectionStart, selectionEnd);
    }, 0);
  };

  const insertHFTag = (field: 'header' | 'footer', tag: string) => {
    if (field === 'header') {
      setHfHeader(prev => {
        if (!prev) return tag;
        const endsWithNewline = prev.endsWith('\n');
        return prev + (endsWithNewline ? '' : '\n') + tag;
      });
    } else {
      setHfFooter(prev => {
        if (!prev) return tag;
        const endsWithNewline = prev.endsWith('\n');
        return prev + (endsWithNewline ? '' : '\n') + tag;
      });
    }
  };

  const getStaticTimestamp = () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${formattedDate}, ${formattedTime}`;
  };

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());
  
  // Left Panel Expansion States
  const [isRawInputExpanded, setIsRawInputExpanded] = useState(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [isReportConfigExpanded, setIsReportConfigExpanded] = useState(true);
  const [isReportSelectionExpanded, setIsReportSelectionExpanded] = useState(true);

  // Right Panel Expansion States
  const [isIntelligenceInstructionsExpanded, setIsIntelligenceInstructionsExpanded] = useState(true);
  
  const [isReportInstructionsExpanded, setIsReportInstructionsExpanded] = useState(true);
  const [isReportPreviewExpanded, setIsReportPreviewExpanded] = useState(true);

  const [customAddOns, setCustomAddOns] = useState<{id: string, label: string, enabled: boolean}[]>([]);
  const [isAddingAddOn, setIsAddingAddOn] = useState(false);
  const [newAddOnLabel, setNewAddOnLabel] = useState('');

  const formatHFText = (text: string | null | undefined): string | null => {
    if (!text) return null;
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const formattedDateTime = `${formattedDate}, ${formattedTime}`;

    const formatted = text
      .replace(/\{\{DATE\}\}/g, formattedDate)
      .replace(/\{\{TIME\}\}/g, formattedTime)
      .replace(/\{\{DATETIME\}\}/g, formattedDateTime)
      .replace(/\{\{TIMESTAMP\}\}/g, formattedDateTime);

    return repairMarkdownHF(formatted);
  };

  const formatForMarkdownPreview = (text: string | null | undefined): string => {
    if (!text) return '';
    // Collapse three or more consecutive linebreaks to at most one blank line (\n\n)
    let cleaned = text.replace(/\n([ \t]*\n){2,}/g, '\n\n');
    // Collapse any blank line immediately after a bold header line to a single newline
    cleaned = cleaned.replace(/^(\*{1,2}[^*]+?\*{1,2}\s*\n)\s*\n+/gm, '$1');
    return cleaned.split('\n').map(line => line.endsWith('  ') ? line : line + '  ').join('\n');
  };

  const getNewsPreviewText = (item: NewsItem): string => {
    if (item.type !== 'refined') {
      return item.raw_text;
    }
    const textParts: string[] = [];
    if (item.summary_hi) {
      textParts.push(item.summary_hi);
    }
    if (item.summary_en) {
      textParts.push(item.summary_en);
    }
    const combined = textParts.join('\n\n');
    if (!combined) {
      return item.raw_text;
    }
    return combined
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/~~/g, '')
      .replace(/`/g, '')
      .replace(/^#+\s+/gm, '')
      .replace(/^-\s+/gm, '• ')
      .trim();
  };

  const getHFSettings = (categoryId: number | undefined) => {
    if (!categoryId) return { header: null, footer: null };
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return { header: null, footer: null };

    let headerRaw: string | null = null;
    let footerRaw: string | null = null;

    // If it's a subcategory, look up the parent
    if (cat.parent_id) {
      const parent = categories.find(p => p.id === cat.parent_id);
      if (parent) {
        headerRaw = parent.is_header_active ? parent.header_text : null;
        footerRaw = parent.is_footer_active ? parent.footer_text : null;
      }
    } else {
      headerRaw = cat.is_header_active ? cat.header_text : null;
      footerRaw = cat.is_footer_active ? cat.footer_text : null;
    }

    return {
      header: formatHFText(headerRaw),
      footer: formatHFText(footerRaw)
    };
  };

  const [justCopiedId, setJustCopiedId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'raw' | 'refined'>('all');
  const [reportInstructions, setReportInstructions] = useState('');
  const [selectedRefinementIds, setSelectedRefinementIds] = useState<number[]>([]);
  const [customRefinements, setCustomRefinements] = useState<{ id: number; instruction: string; elaborated_prompt?: string | null; created_at?: string }[]>([]);

  const refineInstructions = customRefinements
    .filter(r => selectedRefinementIds.includes(r.id))
    .map(r => (r.elaborated_prompt && r.elaborated_prompt.trim()) ? r.elaborated_prompt.trim() : r.instruction)
    .join('; ');
  const [isAddingRefinement, setIsAddingRefinement] = useState(false);
  const [newRefinementInstruction, setNewRefinementInstruction] = useState('');
  const [editingRefinementId, setEditingRefinementId] = useState<number | null>(null);
  const [editingRefinementText, setEditingRefinementText] = useState('');
  const [editingElaboratedId, setEditingElaboratedId] = useState<number | null>(null);
  const [elaboratedPromptText, setElaboratedPromptText] = useState('');
  const [deletingRefinementId, setDeletingRefinementId] = useState<number | null>(null);
  const [demoDaysAgo, setDemoDaysAgo] = useState(0);
  const [timeFilter, setTimeFilter] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState<'from' | 'to' | false>(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'whatsapp' | 'raw'>('desktop');
  const [reportZoom, setReportZoom] = useState(1);
  const [newsZoom, setNewsZoom] = useState(1);
  const [isWhatsAppExpanded, setIsWhatsAppExpanded] = useState(false);
  
  const [reportOptions, setReportOptions] = useState({
    withHeadline: true,
    withHeader: false,
    withFooter: false,
    language: 'both' as 'en' | 'hi' | 'both',
    order: 'hi-en' as 'en-hi' | 'hi-en',
    format: 'bullet' as 'paragraph' | 'bullet',
    length: 'short' as 'short' | 'medium' | 'normal',
    lineLimit: '',
    includeSentiment: false,
    extractFigures: false,
    addImpact: false,
    generateTags: false,
  });

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isThemeMenuExpanded, setIsThemeMenuExpanded] = useState(false);
  const [isZoomMenuExpanded, setIsZoomMenuExpanded] = useState(false);
  const [isLanguageMenuExpanded, setIsLanguageMenuExpanded] = useState(false);
  const [isOrderMenuExpanded, setIsOrderMenuExpanded] = useState(false);
  const [isFormatMenuExpanded, setIsFormatMenuExpanded] = useState(false);
  const [isTimeMenuExpanded, setIsTimeMenuExpanded] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const orderMenuRef = useRef<HTMLDivElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const timeMenuRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(event.target as Node)) {
        setIsZoomMenuExpanded(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuExpanded(false);
      }
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target as Node)) {
        setIsLanguageMenuExpanded(false);
      }
      if (orderMenuRef.current && !orderMenuRef.current.contains(event.target as Node)) {
        setIsOrderMenuExpanded(false);
      }
      if (formatMenuRef.current && !formatMenuRef.current.contains(event.target as Node)) {
        setIsFormatMenuExpanded(false);
      }
      if (timeMenuRef.current && !timeMenuRef.current.contains(event.target as Node)) {
        setIsTimeMenuExpanded(false);
      }
    };

    if (isZoomMenuExpanded || isThemeMenuExpanded || isLanguageMenuExpanded || isOrderMenuExpanded || isFormatMenuExpanded || isTimeMenuExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isZoomMenuExpanded, isThemeMenuExpanded, isLanguageMenuExpanded, isOrderMenuExpanded, isFormatMenuExpanded, isTimeMenuExpanded]);

  // Handle theme effect
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handle global zoom effect
  useEffect(() => {
    document.documentElement.style.fontSize = `${zoomLevel}%`;
  }, [zoomLevel]);

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 10, 150));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 10, 70));
  };

  const [refineOptions, setRefineOptions] = useState({
    withHeadline: true,
    withHeader: false,
    withFooter: false,
    language: 'both' as 'en' | 'hi' | 'both',
    order: 'hi-en' as 'en-hi' | 'hi-en',
    format: 'bullet' as 'paragraph' | 'bullet',
    length: 'short' as 'short' | 'medium' | 'normal',
    lineLimit: '',
    includeSentiment: false,
    extractFigures: false,
    addImpact: false,
    generateTags: false,
  });

  const [sidebarWidth, setSidebarWidth] = useState(300); // Pixels
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(50); // Percentage
  const [lastWidth, setLastWidth] = useState(50);
  const [maximizedPanel, setMaximizedPanel] = useState<'left' | 'right' | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [calendarRef]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      setCategories(data);
      if (data.length > 0) {
        if (!activeCategory) {
          setActiveCategory(data[0].name);
          setActiveCategoryId(data[0].id);
          setSelectedCategoryIds(prev => {
            if (prev.size === 0) {
              const children = data.filter((c: any) => c.parent_id === data[0].id).map((c: any) => Number(c.id));
              return new Set([Number(data[0].id), ...children]);
            }
            return prev;
          });
        } else if (!activeCategoryId) {
          const current = data.find((c: any) => c.name === activeCategory);
          if (current) {
            setActiveCategoryId(current.id);
            setSelectedCategoryIds(prev => {
              if (prev.size === 0) {
                const isParent = current.parent_id === null;
                if (isParent) {
                  const children = data.filter((c: any) => c.parent_id === current.id).map((c: any) => Number(c.id));
                  return new Set([Number(current.id), ...children]);
                }
                return new Set([Number(current.id)]);
              }
              return prev;
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, [activeCategory, activeCategoryId]);

  const fetchApiKeys = useCallback(async () => {
    try {
      const response = await fetch('/api/keys');
      const data = await response.json();
      setApiKeys(data);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    }
  }, []);

  const fetchPrompts = useCallback(async () => {
    try {
      const response = await fetch('/api/prompts');
      if (response.ok) {
        const data: PromptTemplate[] = await response.json();
        const map = data.reduce((acc, curr) => ({ ...acc, [curr.key]: curr }), {});
        setPromptTemplates(map);
      }
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
    }
  }, []);

  const fetchCustomRefinements = useCallback(async () => {
    try {
      const response = await fetch('/api/custom-refinements');
      if (response.ok) {
        const data = await response.json();
        setCustomRefinements(data);
      }
    } catch (error) {
      console.error('Failed to fetch custom refinements:', error);
    }
  }, []);

  const callGeminiWithFallback = async (prompt: string, schema?: any, images?: { data: string, mimeType: string }[]) => {
    const activeKeys = apiKeys.filter(k => k.is_active === 1).sort((a, b) => a.sort_order - b.sort_order);
    
    const parts: any[] = [{ text: prompt }];
    if (images && images.length > 0) {
      images.forEach(img => {
        parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
      });
    }

    // If no keys in DB, use environment variable
    if (activeKeys.length === 0) {
      const fallbackAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const config: any = {};
      if (schema) {
        config.responseMimeType = "application/json";
        config.responseSchema = schema;
      }
      const res = await fallbackAi.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts }],
        config: Object.keys(config).length > 0 ? config : undefined
      });
      return res;
    }

    for (const key of activeKeys) {
      if (key.status === 'exhausted' || key.status === 'invalid') continue;

      try {
        const currentAi = new GoogleGenAI({ apiKey: key.api_key });
        const config: any = {};
        if (schema) {
          config.responseMimeType = "application/json";
          config.responseSchema = schema;
        }
        const res = await currentAi.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: 'user', parts }],
          config: Object.keys(config).length > 0 ? config : undefined
        });

        // Update usage count
        await fetch(`/api/keys/${key.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            usage_count: key.usage_count + 1,
            last_used_at: new Date().toISOString()
          })
        });
        
        // Refresh keys to show updated usage
        fetchApiKeys();

        return res;
      } catch (error: any) {
        console.error(`Key ${key.name} failed:`, error);
        
        // Check if it's a quota error (429) or invalid key (400/403)
        const errorMessage = error?.message || '';
        if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('exhausted')) {
          await fetch(`/api/keys/${key.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'exhausted' })
          });
        } else if (errorMessage.includes('400') || errorMessage.includes('403') || errorMessage.includes('API key not valid')) {
          await fetch(`/api/keys/${key.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'invalid' })
          });
        }
        
        // Refresh keys to show updated status
        fetchApiKeys();
        
        // Continue to the next key
      }
    }

    throw new Error('All available API keys have been exhausted or are invalid.');
  };

  useEffect(() => {
    fetchCategories();
    fetchApiKeys();
    fetchPrompts();
    fetchCustomRefinements();
  }, [fetchCategories, fetchApiKeys, fetchPrompts, fetchCustomRefinements]);

  const isDuplicateName = (name: string, parentId: number | null, excludeId: number | null = null) => {
    return categories.some(c => 
      c.id !== excludeId && 
      (c.parent_id || null) === (parentId || null) && 
      c.name.toLowerCase() === name.trim().toLowerCase()
    );
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setAddingToParentId(null);
      return;
    }

    // Duplicate check
    if (isDuplicateName(newCategoryName, null)) {
      alert(`A section named "${newCategoryName}" already exists at the top level.`);
      return;
    }

    setIsAddingCategory(true);
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName }),
      });
      if (response.ok) {
        const newCat = await response.json();
        await fetchCategories();
        setActiveCategory(newCategoryName);
        setActiveCategoryId(newCat.id);
        setNewCategoryName('');
        setAddingToParentId(null);
      }
    } catch (error) {
      console.error('Failed to add category:', error);
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleEditCategory = async (id: number) => {
    if (!editingCategoryName.trim()) {
      setEditingCategoryId(null);
      return;
    }

    // Duplicate check
    const catToEdit = categories.find(c => c.id === id);
    if (!catToEdit) return;
    
    if (isDuplicateName(editingCategoryName, catToEdit.parent_id || null, id)) {
      alert(`A section named "${editingCategoryName}" already exists in this level.`);
      return;
    }

    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCategoryName.trim() }),
      });
      if (response.ok) {
        await fetchCategories();
        if (activeCategoryId === id) {
          setActiveCategory(editingCategoryName.trim());
        }
      }
    } catch (error) {
      console.error('Failed to update category:', error);
    } finally {
      setEditingCategoryId(null);
      setEditingCategoryName('');
    }
  };

  const handleSaveHeaderFooter = async () => {
    if (!hfEditingCategory) return;
    try {
      const response = await fetch(`/api/categories/${hfEditingCategory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          header_text: hfHeader,
          footer_text: hfFooter,
          is_header_active: isHfHeaderActive,
          is_footer_active: isHfFooterActive
        }),
      });
      if (response.ok) {
        setCategories(categories.map(c => c.id === hfEditingCategory.id ? { 
          ...c, 
          header_text: hfHeader, 
          footer_text: hfFooter, 
          is_header_active: isHfHeaderActive ? 1 : 0, 
          is_footer_active: isHfFooterActive ? 1 : 0 
        } : c));
        setIsHeaderFooterModalOpen(false);
      } else {
        const errData = await response.json();
        alert(`Failed to save settings: ${errData.details || errData.error || 'Server error'}`);
      }
    } catch (error) {
      console.error('Failed to save header/footer settings:', error);
      alert('Network or client error in saving header/footer settings.');
    }
  };

  const handleAddCustomRefinement = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const response = await fetch('/api/custom-refinements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmed }),
      });
      if (response.ok) {
         await fetchCustomRefinements();
      } else {
         const err = await response.json();
         alert(err.error || 'Failed to save instruction');
      }
    } catch (error) {
      console.error('Failed to create custom refinement:', error);
    }
  };

  const handleUpdateCustomRefinement = async (id: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const response = await fetch(`/api/custom-refinements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmed }),
      });
      if (response.ok) {
        await fetchCustomRefinements();
        setEditingRefinementId(null);
        setEditingRefinementText('');
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to edit instruction');
      }
    } catch (error) {
      console.error('Failed to update custom refinement:', error);
    }
  };

  const handleUpdateCustomRefinementElaborated = async (id: number, instruction: string, elaboratedPrompt: string | null) => {
    try {
      const response = await fetch(`/api/custom-refinements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, elaborated_prompt: elaboratedPrompt }),
      });
      if (response.ok) {
        await fetchCustomRefinements();
        setEditingElaboratedId(null);
        setElaboratedPromptText('');
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to update elaborated prompt');
      }
    } catch (error) {
      console.error('Failed to update custom refinement elaborated prompt:', error);
    }
  };

  const handleDeleteCustomRefinement = async (id: number) => {
    try {
      const response = await fetch(`/api/custom-refinements/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await fetchCustomRefinements();
        if (deletingRefinementId === id) {
          setDeletingRefinementId(null);
        }
      } else {
        console.error('Failed to delete custom instruction');
      }
    } catch (error) {
      console.error('Failed to delete custom refinement:', error);
    }
  };

  const handleAddSubCategory = async (parentId: number) => {
    if (!newCategoryName.trim()) {
      setAddingToParentId(null);
      return;
    }

    // Duplicate check
    if (isDuplicateName(newCategoryName, parentId)) {
      alert(`A sub-section named "${newCategoryName}" already exists in this section.`);
      return;
    }

    setIsAddingCategory(true);
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName, parent_id: parentId }),
      });
      
      if (response.ok) {
        const newCat = await response.json();
        await fetchCategories();
        setExpandedCategories(prev => ({ ...prev, [parentId]: true }));
        setActiveCategory(newCategoryName);
        setActiveCategoryId(newCat.id);
        setNewCategoryName('');
        setAddingToParentId(null);
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'Failed to add sub-section'}`);
      }
    } catch (error) {
      console.error('Failed to add sub-category:', error);
      alert('Failed to connect to server. Please try again.');
    } finally {
      setIsAddingCategory(false);
    }
  };

  const toggleCategorySelection = (e: React.MouseEvent, id: number | string) => {
    e.stopPropagation();
    setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      const isSelected = next.has(Number(id));
      const targetId = Number(id);
      
      const cat = categories.find(c => c.id == id);
      if (!cat) return next;

      const isSubcategory = cat.parent_id !== null && cat.parent_id !== undefined;
      
      if (isSubcategory) {
        // Toggling a child
        if (isSelected) {
          next.delete(targetId);
          // Uncheck parent implicitly, since not all children are checked
          if (cat.parent_id) next.delete(cat.parent_id);
        } else {
          next.add(targetId);
          // Check if all siblings are now checked, if so, check the parent
          const siblings = categories.filter(c => c.parent_id === cat.parent_id);
          const allSiblingsChecked = siblings.every(sibling => next.has(sibling.id));
          if (allSiblingsChecked && cat.parent_id) {
            next.add(cat.parent_id);
          } else if (cat.parent_id) {
            // Ensure parent is unchecked if not all siblings are checked
            next.delete(cat.parent_id);
          }
        }
      } else {
        // Toggling a parent
        const childrenIds = categories.filter(c => c.parent_id == targetId).map(c => c.id);
        if (isSelected) {
          next.delete(targetId);
          childrenIds.forEach(childId => next.delete(childId));
        } else {
          next.add(targetId);
          childrenIds.forEach(childId => next.add(childId));
        }
      }
      
      return next;
    });
  };

  const toggleCategory = (id: number) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Fetch news feed for the active category
  const fetchFeed = useCallback(async () => {
    if (selectedCategoryIds.size === 0) {
      setNewsFeed([]);
      return;
    }
    setIsLoadingFeed(true);
    try {
      const ids = Array.from(selectedCategoryIds).join(',');
      const response = await fetch(`/api/news/multi?ids=${ids}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setNewsFeed(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch news feed:', error);
      setNewsFeed([]);
    } finally {
      setIsLoadingFeed(false);
    }
  }, [selectedCategoryIds]);

  const fetchReports = useCallback(async () => {
    if (!activeCategoryId) return;
    setIsLoadingReports(true);
    try {
      const response = await fetch(`/api/reports/${activeCategoryId}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setReportsList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      setReportsList([]);
    } finally {
      setIsLoadingReports(false);
    }
  }, [activeCategoryId]);

  const fetchTrash = useCallback(async (categoryId?: number | null) => {
    setIsLoadingTrash(true);
    try {
      const url = categoryId ? `/api/trash?category_id=${categoryId}` : '/api/trash';
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setTrashItems({
        news: Array.isArray(data.news) ? data.news : [],
        reports: Array.isArray(data.reports) ? data.reports : []
      });
    } catch (error) {
      console.error('Failed to fetch trash:', error);
      setTrashItems({ news: [], reports: [] });
    } finally {
      setIsLoadingTrash(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'intelligence') {
      fetchFeed();
    } else if (viewMode === 'trash') {
      fetchTrash(activeCategoryId);
    }
  }, [fetchFeed, fetchReports, fetchTrash, viewMode, activeCategoryId]);

  const handleProcess = async () => {
    if ((!inputText.trim() && inputImages.length === 0) || !activeCategoryId) return;
    
    setIsProcessing(true);
    try {
      const response = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category_id: activeCategoryId, 
          category_name: activeCategory,
          raw_text: inputText,
          images: inputImages,
          type: 'raw'
        }),
      });
      
      if (response.ok) {
        setInputText('');
        setInputImages([]);
        await fetchFeed(); // Refresh the list
      }
    } catch (error) {
      console.error('Failed to save news:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddDemoNews = async () => {
    if (!activeCategoryId) return;
    const demoTexts: Record<string, string> = {
      'METAL': `Gold prices surged to a new record high of $2,350 per ounce as central banks continued their aggressive buying spree.
Analysts suggest that geopolitical tensions and inflation concerns are driving investors toward safe-haven assets.
Silver also followed suit, gaining 2% to reach its highest level in three years.
Copper futures on the London Metal Exchange rose as supply disruptions in South America tightened the market.
Aluminum production in China saw a slight decline due to environmental regulations, pushing prices upward.
Nickel markets remained volatile following reports of potential export restrictions from major producers.
Zinc inventories at LME warehouses dropped to their lowest levels in six months.
Lead prices were stable, supported by steady demand from the automotive battery sector.
Platinum and Palladium saw mixed results as the transition to electric vehicles impacts long-term demand.
Iron ore prices recovered slightly after a period of weakness, driven by optimism about infrastructure spending.
Rare earth metal prices spiked as trade tensions raised concerns about supply chain security.
The overall sentiment in the metals sector remains bullish as investors hedge against currency devaluation.
Mining companies are reporting increased exploration budgets in response to higher commodity prices.
Recycling initiatives for critical minerals are gaining traction in Europe and North America.
Technological advancements in extraction are helping to offset rising energy costs in the smelting process.
Market participants are closely monitoring the Federal Reserve's interest rate decisions for future direction.
The physical demand for gold in India and China remains robust despite the high price environment.
Central banks in emerging markets have been the primary drivers of the recent gold rally.
Geopolitical risks in the Middle East continue to provide a floor for precious metal prices.
The long-term outlook for industrial metals is tied to the global transition toward green energy.`,
      'ENERGY': `Oil prices stabilized around $85 per barrel following a surprise draw in US crude inventories.
OPEC+ members are expected to maintain their current production cuts through the end of the quarter.
Natural gas futures in Europe fell as mild weather and high storage levels reduced immediate demand.
The transition to renewable energy sources continues to impact long-term investment in fossil fuel infrastructure.
Solar and wind power capacity additions reached record levels in the past year, according to industry reports.
Electric vehicle adoption is gradually reducing the growth rate of global gasoline demand.
Nuclear power is seeing a resurgence in several countries as a reliable source of carbon-free baseload energy.
Coal prices remained under pressure as environmental policies discourage its use in power generation.
Hydrogen energy projects are receiving significant government subsidies in the US and the EU.
Energy efficiency measures are helping to dampen the growth of total energy consumption in developed economies.
The strategic petroleum reserve in the US is being gradually refilled after previous releases.
Refinery margins have been healthy, supported by strong demand for middle distillates like diesel and jet fuel.
Geopolitical tensions in key oil-producing regions remain a significant risk factor for price spikes.
The global LNG market is becoming increasingly interconnected, with new export terminals coming online.
Battery storage technology is playing a crucial role in balancing the intermittent nature of renewables.
Carbon capture and storage initiatives are being integrated into traditional energy production processes.
The impact of climate change on energy infrastructure is becoming a growing concern for utility companies.
Investment in smart grid technology is improving the efficiency and reliability of electricity distribution.
The role of natural gas as a "bridge fuel" is being debated in the context of net-zero targets.
Global energy demand is projected to continue growing, driven primarily by emerging economies.`,
      'AGRICULTURE': `Wheat futures rose by 3% today due to unfavorable weather conditions in key growing regions.
Supply chain disruptions in Eastern Europe are also contributing to the upward pressure on global grain prices.
Corn prices followed wheat higher, supported by strong demand from the ethanol and livestock sectors.
Soybean markets were influenced by reports of a smaller-than-expected harvest in South America.
Rice prices remained elevated as export restrictions from major producers limited global supply.
Cotton futures saw a decline as concerns about a global economic slowdown impacted textile demand.
Sugar prices spiked to multi-year highs due to production shortfalls in India and Thailand.
Coffee markets were volatile, with dry weather in Brazil raising concerns about the upcoming crop.
Cocoa prices reached record levels as disease and aging trees impacted production in West Africa.
The livestock sector is facing challenges from high feed costs and outbreaks of animal diseases.
Palm oil prices were supported by increased demand for biodiesel and lower production in Southeast Asia.
Fertilizer costs have stabilized but remain high compared to historical averages, impacting farmer margins.
The adoption of precision agriculture technology is helping to improve yields and reduce input usage.
Climate change is increasing the frequency and severity of extreme weather events affecting agriculture.
Global food security remains a top priority for international organizations and governments.
The shift toward plant-based diets is creating new opportunities and challenges for traditional farmers.
Sustainable farming practices are being increasingly incentivized by food companies and retailers.
Trade policies and tariffs continue to influence the flow of agricultural commodities across borders.
The impact of logistics and transportation costs on food prices is a key concern for consumers.
Agricultural innovation, including gene editing and vertical farming, is seen as essential for future supply.`,
      'DEFAULT': `Global market indices showed mixed results today as investors awaited the latest inflation data.
Tech stocks led the gains, while the manufacturing sector faced headwinds from rising raw material costs.
The Federal Reserve's upcoming meeting is the primary focus for market participants seeking clues on interest rates.
Corporate earnings reports have been generally positive, but guidance for the next quarter remains cautious.
The US dollar strengthened against a basket of major currencies, impacting export-oriented companies.
Bond yields rose as investors adjusted their expectations for the timing of potential rate cuts.
The labor market remains resilient, with job growth exceeding expectations in several sectors.
Consumer spending has shown signs of softening in response to persistent inflationary pressures.
The housing market is facing challenges from high mortgage rates and limited inventory.
Geopolitical risks continue to weigh on investor sentiment, particularly in the Middle East and Europe.
The growth outlook for the global economy remains uncertain, with varying performance across regions.
Emerging markets are seeing increased capital inflows as investors seek higher returns.
The impact of artificial intelligence on productivity and corporate profitability is a major theme.
Regulatory developments in the tech and financial sectors are being closely monitored by analysts.
Supply chain normalization has helped to reduce some of the inflationary pressures seen in previous years.
The transition to a low-carbon economy is creating new investment opportunities in green technology.
Market volatility has remained relatively low, but risks of sudden spikes persist.
The role of fiscal policy in supporting economic growth is being debated in several countries.
International trade relations are being reshaped by geopolitical considerations and industrial policies.
Long-term investors are focusing on quality and defensive sectors in an environment of economic uncertainty.`
    };

    const text = demoTexts[activeCategory.toUpperCase()] || demoTexts['DEFAULT'];
    
    // Calculate backdated timestamp
    let createdAt = null;
    if (demoDaysAgo > 0) {
      const date = new Date();
      date.setDate(date.getDate() - demoDaysAgo);
      createdAt = date.toISOString();
    }
    
    setIsProcessing(true);
    try {
      const response = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category_id: activeCategoryId, 
          category_name: activeCategory,
          raw_text: text,
          type: 'raw',
          created_at: createdAt
        }),
      });
      
      if (response.ok) {
        await fetchFeed();
      }
    } catch (error) {
      console.error('Failed to save demo news:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefine = async (item: NewsItem) => {
    if (!item.raw_text && (!item.images || item.images.length === 0)) return;
    
    setIsRefining(true);
    try {
      const prompt = `
        You are a senior commodity market analyst. Refine the following raw news intelligence for the ${activeCategory} market.
        
        RAW NEWS:
        ${item.raw_text || "[Images attached for analysis]"}
        
        INSTRUCTIONS:
        ${refineOptions.withHeadline && promptTemplates['headline_format'] ? promptTemplates['headline_format'].instruction : ""}
        ${refineOptions.withHeader ? "- Include a professional header identifying the source and category." : ""}
        ${refineOptions.withFooter ? "- Include a professional footer with market disclaimers." : ""}
        - Language: ${refineOptions.language === 'both' ? (promptTemplates['lang_both']?.instruction || 'Provide both English and Hindi.') : refineOptions.language === 'en' ? (promptTemplates['lang_en']?.instruction || 'Provide English only.') : (promptTemplates['lang_hi']?.instruction || 'Provide Hindi only.')}
        - Format: ${refineOptions.format === 'paragraph' ? (promptTemplates['format_paragraph']?.instruction || 'Write as a cohesive paragraph.') : (promptTemplates['format_bullets']?.instruction || 'Use clear bullet points.')}
        - Length: ${refineOptions.length === 'short' ? (promptTemplates['length_short']?.instruction || 'Very short and concise.') : refineOptions.length === 'medium' ? (promptTemplates['length_medium']?.instruction || 'Medium length, balanced detail.') : (promptTemplates['length_long']?.instruction || 'Normal length, comprehensive.')}
        ${refineOptions.lineLimit ? `- Strictly limit the summary to ${refineOptions.lineLimit} lines.` : ""}
        ${refineOptions.includeSentiment && promptTemplates['addon_sentiment'] ? promptTemplates['addon_sentiment'].instruction : ""}
        ${refineOptions.extractFigures && promptTemplates['addon_figures'] ? promptTemplates['addon_figures'].instruction : ""}
        ${refineOptions.addImpact && promptTemplates['addon_impact'] ? promptTemplates['addon_impact'].instruction : ""}
        ${refineOptions.generateTags && promptTemplates['addon_tags'] ? promptTemplates['addon_tags'].instruction : ""}
        ${refineInstructions ? `- Custom Focus: ${refineInstructions}` : ""}
        ${customAddOns.filter(a => a.enabled).map(a => `- ${a.label}`).join('\n')}
        
        Return the result in JSON format with:
        - 'summary_en': The refined English text.
        - 'summary_hi': The refined Hindi text.
        
        Note: If images are provided, analyze them for data, charts, or text and incorporate the findings into the summaries.
      `;

      const imagesParts = item.images?.map(img => ({
        data: img.split(',')[1] || img,
        mimeType: img.startsWith('data:') ? img.split(';')[0].split(':')[1] : 'image/jpeg'
      }));

      const aiResponse = await callGeminiWithFallback(prompt, {
        type: Type.OBJECT,
        properties: {
          summary_en: { type: Type.STRING },
          summary_hi: { type: Type.STRING },
        },
        required: ['summary_en', 'summary_hi'],
      }, imagesParts);

      const result = JSON.parse(aiResponse.text);
      
      // Save as a NEW refined news item linked to the parent
      const saveResponse = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: item.category_id,
          category_name: item.category,
          raw_text: item.raw_text,
          type: 'refined',
          parent_id: item.id,
          summary_en: result.summary_en,
          summary_hi: result.summary_hi,
        }),
      });

      if (saveResponse.ok) {
        const savedData = await saveResponse.json();
        await fetchFeed(); // Refresh the list
        // Select the new refined item
        setSelectedNews({
          ...item,
          id: savedData.id,
          type: 'refined',
          parent_id: item.id,
          summary_en: result.summary_en,
          summary_hi: result.summary_hi,
          is_copied: 0,
        });
      }
    } catch (error) {
      console.error('Failed to refine news with AI:', error);
    } finally {
      setIsRefining(false);
    }
  };

  const handleCopy = async (type: 'news' | 'report', id: number, content: string) => {
    try {
      // Helper to convert standard markdown to WhatsApp formatting
      const formatForWhatsApp = (text: string) => {
        let formatted = text
          .replace(/\*\*(.*?)\*\*/g, '*$1*') // Bold
          .replace(/__(.*?)__/g, '_$1_')     // Italic
          .replace(/^### (.*$)/gm, '*$1*')   // H3 as Bold
          .replace(/^## (.*$)/gm, '*$1*')    // H2 as Bold
          .replace(/^# (.*$)/gm, '*$1*')     // H1 as Bold
          .replace(/^- (.*$)/gm, '• $1')    // Bullets
          .replace(/~~(.*?)~~/g, '~$1~')    // Strikethrough
          .replace(/`([^`\n]+?)`/g, '```$1```'); // Monospace/Code block for WhatsApp

        // Normalize multiple consecutive blank lines (3 or more newlines become at most 2 newlines / 1 blank line)
        formatted = formatted.replace(/\n([ \t]*\n){2,}/g, '\n\n');

        // Collapse any blank line (or extra blank lines) immediately after a bold header line to a single newline
        formatted = formatted.replace(/^(\*[^*]+?\*\s*\n)\s*\n+/gm, '$1');

        return formatted;
      };

      const formattedContent = formatForWhatsApp(content);
      await navigator.clipboard.writeText(formattedContent);
      
      // Set a timestamp-backed dynamic ID to trigger click response and animation waves even on Nth clicks
      const pulseId = `${type}-${id}-${Date.now()}`;
      setJustCopiedId(pulseId);
      setTimeout(() => {
        setJustCopiedId(prev => prev === pulseId ? null : prev);
      }, 1000);

      const endpoint = type === 'news' ? `/api/news/${id}` : `/api/reports/${id}/copied`;
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_copied: 1 }),
      });

      if (response.ok) {
        if (type === 'news') {
          setNewsFeed(prev => prev.map(item => item.id === id ? { ...item, is_copied: 1 } : item));
          if (selectedNews?.id === id) {
            setSelectedNews(prev => prev ? { ...prev, is_copied: 1 } : null);
          }
        } else {
          setReportsList(prev => prev.map(item => item.id === id ? { ...item, is_copied: 1 } : item));
          if (selectedReport?.id === id) {
            setSelectedReport(prev => prev ? { ...prev, is_copied: 1 } : null);
          }
        }
      }
    } catch (err) {
      console.error('Failed to copy text or update status:', err);
    }
  };

  const fetchNewsForReport = useCallback(async () => {
    if (!activeCategoryId || viewMode !== 'reports') return;
    setIsFetchingNewsForReport(true);
    try {
      const response = await fetch(`/api/news/${activeCategoryId}/period/${selectedReportType}`);
      const data = await response.json();
      const news = Array.isArray(data) ? data : [];
      setNewsForReport(news);
      // Auto-select all by default when news are fetched
      setSelectedNewsIds(new Set(news.map(item => item.id)));
    } catch (error) {
      console.error('Failed to fetch news for report:', error);
      setNewsForReport([]);
    } finally {
      setIsFetchingNewsForReport(false);
    }
  }, [activeCategoryId, selectedReportType, viewMode]);

  useEffect(() => {
    fetchNewsForReport();
  }, [fetchNewsForReport]);

  const toggleNewsSelection = (id: number) => {
    setSelectedNewsIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllNews = () => {
    setSelectedNewsIds(new Set(newsForReport.map(item => item.id)));
  };

  const clearAllNews = () => {
    setSelectedNewsIds(new Set());
  };

  const handleToggleStar = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredNewsIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEditNews = (item: NewsItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingNews(item);
    setEditingNewsContent(item.raw_text);
    setEditingNewsImages(item.images || []);
  };

  const saveEditedNews = () => {
    if (!isEditingNews) return;
    
    const updatedContent = editingNewsContent;
    const updatedImages = editingNewsImages;
    
    setNewsFeed(prev => prev.map(item => 
      item.id === isEditingNews.id ? { ...item, raw_text: updatedContent, images: updatedImages } : item
    ));
    
    if (selectedNews?.id === isEditingNews.id) {
      setSelectedNews({ ...selectedNews, raw_text: updatedContent, images: updatedImages });
    }
    
    setIsEditingNews(null);
  };

  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    setIsProcessingImage(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          resolve(reader.result as string);
        };
      });
      reader.readAsDataURL(file);
      const fullBase64 = await base64Promise;
      
      setEditingNewsImages(prev => [...prev, fullBase64]);
    } catch (error) {
      console.error("Image processing error:", error);
      alert("Failed to process image. Please try again.");
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleImagePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processImageFile(file);
        }
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      processImageFile(file);
    });
  };

  const handleInputImagePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            setInputImages(prev => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleInputImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setInputImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleToggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNewsIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandNews = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNewsIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGenerateReport = async (type: 'daily' | 'weekly' | 'monthly') => {
    if (!activeCategoryId) return;
    
    const selectedItems = newsForReport.filter(item => selectedNewsIds.has(item.id));
    if (selectedItems.length === 0) {
      alert('Please select at least one news item to generate a report.');
      return;
    }

    setIsGeneratingReport(true);
    try {
      let content_en = '';
      let content_hi = '';

      const optionsPrompt = `
        FORMATTING:
        ${reportOptions.withHeadline && promptTemplates['headline_format'] ? promptTemplates['headline_format'].instruction : ""}
        ${reportOptions.withHeader ? "- Include a professional report header with current date and market category." : ""}
        ${reportOptions.withFooter ? "- Include a professional report footer with disclaimers and contact information." : ""}
        - Language: ${reportOptions.language === 'both' ? (promptTemplates['lang_both']?.instruction || 'Provide both English and Hindi.') : reportOptions.language === 'en' ? (promptTemplates['lang_en']?.instruction || 'Provide English only.') : (promptTemplates['lang_hi']?.instruction || 'Provide Hindi only.')}
        - Format: ${reportOptions.format === 'paragraph' ? (promptTemplates['format_paragraph']?.instruction || 'Write as a cohesive paragraph.') : (promptTemplates['format_bullets']?.instruction || 'Use clear bullet points.')}
        - Length: ${reportOptions.length === 'short' ? (promptTemplates['length_short']?.instruction || 'Very short and concise.') : reportOptions.length === 'medium' ? (promptTemplates['length_medium']?.instruction || 'Medium length, balanced detail.') : (promptTemplates['length_long']?.instruction || 'Normal length, comprehensive.')}
        ${reportOptions.lineLimit ? `- Limit to approximately ${reportOptions.lineLimit} lines` : ''}
        
        INTELLIGENCE ADD-ONS:
        ${reportOptions.includeSentiment && promptTemplates['addon_sentiment'] ? promptTemplates['addon_sentiment'].instruction : ""}
        ${reportOptions.extractFigures && promptTemplates['addon_figures'] ? promptTemplates['addon_figures'].instruction : ""}
        ${reportOptions.addImpact && promptTemplates['addon_impact'] ? promptTemplates['addon_impact'].instruction : ""}
        ${reportOptions.generateTags && promptTemplates['addon_tags'] ? promptTemplates['addon_tags'].instruction : ""}
        ${reportInstructions ? `- Custom Focus: ${reportInstructions}` : ''}
        ${customAddOns.filter(a => a.enabled).map(a => `- ${a.label}`).join('\n')}
      `;

      if (reportSource === 'master') {
        // 3-Step Synthesis
        // Step 1: Raw Summary
        const rawContext = selectedItems.map(item => `- ${item.raw_text}`).join('\n');
        const rawPrompt = `Summarize these RAW news items for ${activeCategory} market report: \n${rawContext}`;
        const rawRes = await callGeminiWithFallback(rawPrompt);
        const rawSummary = rawRes.text;

        // Step 2: Refined Summary
        const refinedContext = selectedItems.map(item => `- ${item.summary_en || item.raw_text}`).join('\n');
        const refinedPrompt = `Summarize these REFINED intelligence items for ${activeCategory} market report: \n${refinedContext}`;
        const refinedRes = await callGeminiWithFallback(refinedPrompt);
        const refinedSummary = refinedRes.text;

        // Step 3: Synthesis
        const masterPrompt = `
          You are a master strategist. Synthesize these two summaries into a final ${type} closing report for ${activeCategory}.
          
          RAW SUMMARY (Precision/Facts):
          ${rawSummary}
          
          REFINED SUMMARY (Strategy/Impact):
          ${refinedSummary}
          
          REPORT REQUIREMENTS:
          ${optionsPrompt}
          
          INSTRUCTIONS:
          - Tackle missing points from either side.
          - Ensure factual density and strategic depth.
          - Return in JSON with 'content_en' (markdown) and 'content_hi'.
        `;
        const masterRes = await callGeminiWithFallback(masterPrompt, {
          type: Type.OBJECT,
          properties: {
            content_en: { type: Type.STRING },
            content_hi: { type: Type.STRING },
          },
          required: ['content_en', 'content_hi'],
        });
        const masterResult = JSON.parse(masterRes.text);
        content_en = masterResult.content_en;
        content_hi = masterResult.content_hi;
      } else {
        // Standard Generation (Raw or Refined)
        const context = selectedItems.map(item => 
          reportSource === 'raw' ? `- ${item.raw_text}` : `- ${item.summary_en || item.raw_text}`
        ).join('\n');

        const prompt = `
          Generate a comprehensive ${type} closing summary report for the ${activeCategory} market.
          Source Data: ${reportSource === 'raw' ? 'Raw News' : 'Refined Intelligence'}
          
          REPORT REQUIREMENTS:
          ${optionsPrompt}
          
          News Items:
          ${context}
          
          Return JSON with 'content_en' (markdown) and 'content_hi'.
        `;

        const aiResponse = await callGeminiWithFallback(prompt, {
          type: Type.OBJECT,
          properties: {
            content_en: { type: Type.STRING },
            content_hi: { type: Type.STRING },
          },
          required: ['content_en', 'content_hi'],
        });
        const result = JSON.parse(aiResponse.text);
        content_en = result.content_en;
        content_hi = result.content_hi;
      }

      // 3. Save report to database
      const saveResponse = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: activeCategoryId,
          category_name: activeCategory,
          type,
          content_en,
          content_hi,
          start_date: new Date().toISOString(),
          end_date: new Date().toISOString(),
          source_news_ids: Array.from(selectedNewsIds),
          source_mode: reportSource
        }),
      });

      if (saveResponse.ok) {
        await fetchReports();
        const savedData = await saveResponse.json();
        // Automatically select the new report
        setSelectedReport({
          id: savedData.id,
          category_id: activeCategoryId,
          category: activeCategory,
          type,
          content_en,
          content_hi,
          is_copied: 0,
          start_date: new Date().toISOString(),
          end_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleMoveToTrash = async (id: number, type: 'news' | 'report') => {
    try {
      const endpoint = type === 'news' ? `/api/news/${id}/trash` : `/api/reports/${id}/trash`;
      const response = await fetch(endpoint, { method: 'PATCH' });
      if (response.ok) {
        if (type === 'news') {
          if (selectedNews?.id === id) setSelectedNews(null);
          fetchFeed();
        } else {
          if (selectedReport?.id === id) setSelectedReport(null);
          fetchReports();
        }
      }
    } catch (error) {
      console.error(`Failed to move ${type} to trash:`, error);
    }
  };

  const handleRestore = async (id: number, type: 'news' | 'report') => {
    try {
      const endpoint = type === 'news' ? `/api/news/${id}/restore` : `/api/reports/${id}/restore`;
      const response = await fetch(endpoint, { method: 'PATCH' });
      if (response.ok) {
        fetchTrash();
      }
    } catch (error) {
      console.error(`Failed to restore ${type}:`, error);
    }
  };

  const handlePermanentDelete = async (id: number, type: 'news' | 'report') => {
    if (!confirm('Are you sure you want to permanently delete this item?')) return;
    try {
      const endpoint = type === 'news' ? `/api/news/${id}` : `/api/reports/${id}`;
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (response.ok) {
        fetchTrash();
      }
    } catch (error) {
      console.error(`Failed to permanently delete ${type}:`, error);
    }
  };

  const toggleMaximize = (panel: 'left' | 'right') => {
    if (maximizedPanel === panel) {
      setMaximizedPanel(null);
      setLeftWidth(lastWidth);
    } else {
      setLastWidth(leftWidth);
      setMaximizedPanel(panel);
      setLeftWidth(panel === 'left' ? 100 : 0);
    }
  };

  const startResizing = useCallback(() => {
    if (maximizedPanel) return;
    setIsResizing(true);
  }, [maximizedPanel]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        
        if (newWidth >= 20 && newWidth <= 80) {
          setLeftWidth(newWidth);
        }
      } else if (isResizingSidebar) {
        const newWidth = e.clientX - 48;
        if (newWidth >= 300 && newWidth <= 600) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing, isResizingSidebar]
  );

  useEffect(() => {
    if (isResizing || isResizingSidebar) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      window.addEventListener('mouseup', () => setIsResizingSidebar(false));
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }

    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, isResizingSidebar, resize, stopResizing]);

  const parseSafeDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    if (dateStr.includes(' ') && !dateStr.includes('T')) {
      return new Date(dateStr.replace(' ', 'T') + 'Z');
    }
    return new Date(dateStr);
  };

  const groupNewsByDate = (news: NewsItem[]) => {
    const groups: Record<string, NewsItem[]> = {};
    
    news.forEach(item => {
      const date = parseSafeDate(item.created_at);
      const dateStr = date.toDateString(); // e.g., "Sat Apr 11 2026"
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(item);
    });
    
    return groups;
  };

  const formatDateHeading = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    const dateOptions: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const dateFormatted = date.toLocaleDateString('en-US', dateOptions).toUpperCase();

    if (date.toDateString() === today.toDateString()) {
      return `TODAY — ${dateFormatted}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `YESTERDAY — ${dateFormatted}`;
    } else {
      const dayOptions: Intl.DateTimeFormatOptions = { weekday: 'long' };
      const dayName = date.toLocaleDateString('en-US', dayOptions).toUpperCase();
      return `${dayName} — ${dateFormatted}`;
    }
  };

  const filteredNews = newsFeed.filter(item => {
    const typeMatch = feedFilter === 'all' || item.type === feedFilter;
    if (!typeMatch) return false;
    
    const itemDate = parseSafeDate(item.created_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (timeFilter === 'daily') {
      const start = startOfDay(now);
      return itemDate >= start;
    }
    if (timeFilter === 'weekly') return diffDays <= 7;
    if (timeFilter === 'monthly') return diffDays <= 30;
    if (timeFilter === 'custom' && customDateRange?.from) {
      const from = startOfDay(customDateRange.from);
      const to = customDateRange.to ? endOfDay(customDateRange.to) : endOfDay(customDateRange.from);
      return isWithinInterval(itemDate, { start: from, end: to });
    }
    
    return true;
  });

  const newsGroups = groupNewsByDate(filteredNews);
  const sortedDateStrings = Object.keys(newsGroups).sort((a, b) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });

  // Calculate disabled dates for calendar
  const oldestNewsDate = newsFeed.length > 0
    ? new Date(Math.min(...newsFeed.map(item => parseSafeDate(item.created_at).getTime())))
    : undefined;
  const disabledDays = oldestNewsDate ? [
    { before: startOfDay(oldestNewsDate) },
    { after: endOfDay(new Date()) }
  ] : [];

  return (
    <>
      <div 
        className={`flex h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${
          theme === 'dark' ? 'bg-[#1a1c1e] text-gray-200' : 'bg-[#f4f5f7] text-gray-800'
        }`}
      >
        {/* --- Utility Vertical Bar --- */}
        <div className="flex w-16 flex-col items-center justify-between bg-[#009f75] py-4 shadow-[4px_0_10px_rgba(0,0,0,0.1)] z-30 shrink-0">
          <div className="flex flex-col items-center space-y-3 w-full px-2 relative">
             
             {/* Target / AI Refinement Custom Focus Toggle Button */}
             <button 
               onClick={() => {
                 setIsIntelligenceInstructionsExpanded(!isIntelligenceInstructionsExpanded);
                 if (!isIntelligenceInstructionsExpanded) {
                   setIsSidebarOpen(true);
                 }
               }}
               className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all hover:scale-105 ${
                 isIntelligenceInstructionsExpanded ? 'bg-white text-amber-605 shadow-sm' : 'text-white hover:bg-white/20'
               }`}
               title="AI Refinement Focus Presets"
               id="sidebar-refinement-toggle-btn"
             >
               <Target size={16} strokeWidth={2.5} className={isIntelligenceInstructionsExpanded ? 'animate-pulse text-amber-500' : 'text-white'} />
             </button>

             <div className="relative flex flex-col items-center" ref={zoomMenuRef}>
               <button 
                 onClick={() => setIsZoomMenuExpanded(!isZoomMenuExpanded)}
                 className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all hover:scale-105 ${
                   isZoomMenuExpanded ? 'bg-white/30' : 'text-white hover:bg-white/20'
                 }`}
                 title="Zoom Controls"
               >
                 <ZoomIn size={16} strokeWidth={2} />
               </button>

               <AnimatePresence>
                 {isZoomMenuExpanded && (
                   <motion.div
                     initial={{ opacity: 0, x: -5 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -10 }}
                     transition={{ duration: 0.15, ease: "easeOut" }}
                     className="absolute left-[56px] top-1/2 -translate-y-1/2 flex items-center bg-[#009f75] p-1.5 rounded-r-xl shadow-[8px_4px_20px_rgba(0,0,0,0.2)] border border-white/20 border-l-0 z-50 origin-left"
                   >
                     <button 
                       onClick={handleZoomOut}
                       className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all hover:bg-white/10"
                       title="Zoom Out"
                     >
                        <ZoomOut size={16} strokeWidth={2} />
                     </button>
                     <div className="px-3 text-white font-black text-[10px] tracking-tight whitespace-nowrap min-w-[40px] text-center">
                       {zoomLevel}%
                     </div>
                     <button 
                       onClick={handleZoomIn}
                       className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all hover:bg-white/10"
                       title="Zoom In"
                     >
                        <ZoomIn size={16} strokeWidth={2} />
                     </button>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>

             <div className="relative flex flex-col items-center w-full" ref={timeMenuRef}>
               <button 
                 onClick={() => setIsTimeMenuExpanded(!isTimeMenuExpanded)}
                 className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                   isTimeMenuExpanded ? 'bg-white/30' : 'text-white hover:bg-white/20'
                 }`}
                 title={timeFilter === 'custom' && customDateRange?.from && customDateRange?.to 
                    ? `Active: ${format(customDateRange.from, 'd MMM, yyyy')} - ${format(customDateRange.to, 'd MMM, yyyy')}` 
                    : `Time Filter: ${timeFilter.toUpperCase()}`
                 }
               >
                 <span className="text-[10px] font-black tracking-wide truncate px-0.5 uppercase leading-none">
                    {timeFilter === 'custom' && customDateRange?.from && customDateRange?.to
                      ? `${format(customDateRange.from, 'MM/dd')}-${format(customDateRange.to, 'MM/dd')}`
                      : timeFilter
                    }
                  </span>
               </button>

               <AnimatePresence>
                 {isTimeMenuExpanded && (
                   <motion.div
                     initial={{ opacity: 0, x: -5 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -10 }}
                     transition={{ duration: 0.15, ease: "easeOut" }}
                     className="absolute left-[56px] top-1/2 -translate-y-1/2 flex items-center space-x-1 bg-[#009f75] p-1.5 rounded-r-xl shadow-[8px_4px_20px_rgba(0,0,0,0.2)] border border-white/20 border-l-0 z-50 origin-left"
                   >
                     {['daily', 'weekly', 'monthly', 'custom'].map((id) => (
                       <button 
                         key={id}
                         onClick={() => {
                           setTimeFilter(id as any);
                           if (id === 'custom') {
                             setIsCalendarOpen('from');
                           } else {
                             setIsTimeMenuExpanded(false);
                           }
                         }}
                         className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tighter transition-all ${
                           timeFilter === id ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                         }`}
                         title={id.toUpperCase()}
                       >{id.toUpperCase()}</button>
                     ))}
                   </motion.div>
                 )}
               </AnimatePresence>
               
               {/* Dual Calendars for Custom Selection */}
               <AnimatePresence>
                 {isTimeMenuExpanded && timeFilter === 'custom' && isCalendarOpen && (
                   <motion.div
                     initial={{ opacity: 0, y: 10, x: -10 }}
                     animate={{ opacity: 1, y: 0, x: 0 }}
                     exit={{ opacity: 0, y: 10, x: -10 }}
                     className="absolute left-[310px] top-0 z-[100] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-gray-200 p-4 flex space-x-6 origin-left min-w-[580px]"
                     ref={calendarRef}
                     onClick={(e) => e.stopPropagation()}
                   >
                     <div className="flex-1">
                       <div className="flex items-center justify-between mb-3 px-1">
                         <span className="text-[10px] font-black text-[#009f75] uppercase tracking-wider">Start Date</span>
                         {customDateRange?.from && <span className="text-[10px] font-bold text-gray-400">{format(customDateRange.from, 'PP')}</span>}
                       </div>
                       <div className="border rounded-xl p-1 bg-gray-50/50">
                         <DayPicker
                           mode="single"
                           selected={customDateRange?.from}
                           onSelect={(date) => {
                             if (date) {
                               setCustomDateRange(prev => ({ from: date, to: prev?.to || date }));
                               setIsCalendarOpen('to');
                             }
                           }}
                           className="m-0"
                         />
                       </div>
                     </div>
                     <div className="flex-1 border-l pl-6">
                       <div className="flex items-center justify-between mb-3 px-1">
                         <span className="text-[10px] font-black text-[#009f75] uppercase tracking-wider">End Date</span>
                         {customDateRange?.to && <span className="text-[10px] font-bold text-gray-400">{format(customDateRange.to, 'PP')}</span>}
                       </div>
                       <div className="border rounded-xl p-1 bg-gray-50/50">
                         <DayPicker
                           mode="single"
                           selected={customDateRange?.to}
                           onSelect={(date) => {
                             if (date) {
                               setCustomDateRange(prev => {
                                 if (prev?.from && date < prev.from) return { from: date, to: prev.from };
                                 return { from: prev?.from, to: date };
                               });
                             }
                           }}
                           className="m-0"
                         />
                       </div>
                       <div className="mt-4 flex justify-end">
                          <button 
                            onClick={() => {
                              setIsCalendarOpen(false);
                              setIsTimeMenuExpanded(false);
                            }}
                            className="px-4 py-1.5 bg-[#009f75] text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-[#008f65] shadow-sm transition-colors"
                          >
                             Confirm Range
                          </button>
                       </div>
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>

             <div className="relative flex flex-col items-center w-full" ref={languageMenuRef}>
               <button 
                 onClick={() => setIsLanguageMenuExpanded(!isLanguageMenuExpanded)}
                 className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                   isLanguageMenuExpanded ? 'bg-white/30' : 'text-white hover:bg-white/20'
                 }`}
                 title="Language Selection"
               >
                 <span className="text-[10px] font-black tracking-wide truncate px-0.5 uppercase leading-none">{refineOptions.language === 'both' ? 'BOTH' : refineOptions.language.toUpperCase()}</span>
               </button>

               <AnimatePresence>
                 {isLanguageMenuExpanded && (
                   <motion.div
                     initial={{ opacity: 0, x: -5 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -10 }}
                     transition={{ duration: 0.15, ease: "easeOut" }}
                     className="absolute left-[56px] top-1/2 -translate-y-1/2 flex items-center space-x-1 bg-[#009f75] p-1.5 rounded-r-xl shadow-[8px_4px_20px_rgba(0,0,0,0.2)] border border-white/20 border-l-0 z-50 origin-left"
                   >
                     <button 
                       onClick={() => {
                         setRefineOptions(prev => ({...prev, language: 'en'}));
                         setReportOptions(prev => ({...prev, language: 'en'}));
                         setIsLanguageMenuExpanded(false);
                       }}
                       className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tighter transition-all ${
                         refineOptions.language === 'en' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                       }`}
                       title="English Only"
                     >EN</button>
                     <button 
                       onClick={() => {
                         setRefineOptions(prev => ({...prev, language: 'hi'}));
                         setReportOptions(prev => ({...prev, language: 'hi'}));
                         setIsLanguageMenuExpanded(false);
                       }}
                       className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tighter transition-all ${
                         refineOptions.language === 'hi' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                       }`}
                       title="Hindi Only"
                     >HI</button>
                     <button 
                       onClick={() => {
                         setRefineOptions(prev => ({...prev, language: 'both'}));
                         setReportOptions(prev => ({...prev, language: 'both'}));
                         setIsLanguageMenuExpanded(false);
                       }}
                       className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tighter transition-all ${
                         refineOptions.language === 'both' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                       }`}
                       title="Both Languages"
                     >BOTH</button>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>

              {refineOptions.language === 'both' && (
                <div className="relative flex flex-col items-center w-full animate-in fade-in zoom-in duration-200" ref={orderMenuRef}>
                  <button 
                    onClick={() => setIsOrderMenuExpanded(!isOrderMenuExpanded)}
                    className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                      isOrderMenuExpanded ? 'bg-white/30' : 'text-white hover:bg-white/20'
                    }`}
                    title="Language Sequence Selector"
                  >
                    <span className="text-[10px] font-black tracking-wide truncate px-0.5 uppercase leading-none">
                      {refineOptions.order === 'hi-en' ? 'HI-EN' : 'EN-HI'}
                    </span>
                  </button>

                  <AnimatePresence>
                    {isOrderMenuExpanded && (
                      <motion.div
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute left-[56px] top-1/2 -translate-y-1/2 flex items-center space-x-1 bg-[#009f75] p-1.5 rounded-r-xl shadow-[8px_4px_20px_rgba(0,0,0,0.2)] border border-white/20 border-l-0 z-50 origin-left"
                      >
                        <button 
                          onClick={() => {
                            setRefineOptions(prev => ({...prev, order: 'hi-en'}));
                            setReportOptions(prev => ({...prev, order: 'hi-en'}));
                            setIsOrderMenuExpanded(false);
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tighter transition-all ${
                            refineOptions.order === 'hi-en' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                          }`}
                          title="Hindi first, then English"
                        >HI-EN</button>
                        <button 
                          onClick={() => {
                            setRefineOptions(prev => ({...prev, order: 'en-hi'}));
                            setReportOptions(prev => ({...prev, order: 'en-hi'}));
                            setIsOrderMenuExpanded(false);
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tighter transition-all ${
                            refineOptions.order === 'en-hi' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                          }`}
                          title="English first, then Hindi"
                        >EN-HI</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

             <button 
               onClick={() => setIsStarredOnly(!isStarredOnly)}
               className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all hover:scale-105 ${
                 isStarredOnly ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/20'
               }`}
               title={`Starred Only: ${isStarredOnly ? 'ON' : 'OFF'}`}
             >
               <Star size={16} fill={isStarredOnly ? 'currentColor' : 'none'} strokeWidth={2} />
             </button>

             <div className="relative flex flex-col items-center" ref={formatMenuRef}>
               <button 
                 onClick={() => setIsFormatMenuExpanded(!isFormatMenuExpanded)}
                 className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all hover:scale-105 ${
                   isFormatMenuExpanded ? 'bg-white/30' : 'text-white hover:bg-white/20'
                 }`}
                 title="Format Selection"
               >
                 {refineOptions.format === 'paragraph' ? <AlignLeft size={16} strokeWidth={2} /> : <List size={16} strokeWidth={2} />}
               </button>

               <AnimatePresence>
                 {isFormatMenuExpanded && (
                   <motion.div
                     initial={{ opacity: 0, x: -5 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -10 }}
                     transition={{ duration: 0.15, ease: "easeOut" }}
                     className="absolute left-[56px] top-1/2 -translate-y-1/2 flex items-center space-x-1 bg-[#009f75] p-1.5 rounded-r-xl shadow-[8px_4px_20px_rgba(0,0,0,0.2)] border border-white/20 border-l-0 z-50 origin-left"
                   >
                     <button 
                       onClick={() => {
                         setRefineOptions(prev => ({...prev, format: 'paragraph'}));
                         setReportOptions(prev => ({...prev, format: 'paragraph'}));
                         setIsFormatMenuExpanded(false);
                       }}
                       className={`p-2 rounded-md transition-all ${
                         refineOptions.format === 'paragraph' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                       }`}
                       title="Paragraph Format"
                     ><AlignLeft size={16} /></button>
                     <button 
                       onClick={() => {
                         setRefineOptions(prev => ({...prev, format: 'bullet'}));
                         setReportOptions(prev => ({...prev, format: 'bullet'}));
                         setIsFormatMenuExpanded(false);
                       }}
                       className={`p-2 rounded-md transition-all ${
                         refineOptions.format === 'bullet' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                       }`}
                       title="Bullet Points"
                     ><List size={16} /></button>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>
                           <button 
                onClick={() => {
                  setRefineOptions(prev => ({...prev, withHeadline: !prev.withHeadline}));
                  setReportOptions(prev => ({...prev, withHeadline: !prev.withHeadline}));
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all hover:scale-105 ${
                  refineOptions.withHeadline ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/20'
                }`}
                title="Toggle Headline"
              >
                <span className="font-extrabold text-[12px]">H</span>
              </button>
          </div>
          <div className="flex flex-col items-center space-y-3 w-full px-2 relative">
             {/* Bottom Utility Icons */}
             <div className="relative flex flex-col items-center" ref={themeMenuRef}>
               <button 
                 onClick={() => setIsThemeMenuExpanded(!isThemeMenuExpanded)}
                 className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all hover:scale-105 ${
                   isThemeMenuExpanded ? 'bg-white/30' : 'text-white hover:bg-white/20'
                 }`}
                 title="Change Appearance"
               >
                 <Palette size={16} strokeWidth={2} />
               </button>

               <AnimatePresence>
                 {isThemeMenuExpanded && (
                   <motion.div
                     initial={{ opacity: 0, x: -5 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -10 }}
                     transition={{ duration: 0.15, ease: "easeOut" }}
                     className="absolute left-[56px] top-1/2 -translate-y-1/2 flex items-center space-x-1 bg-[#009f75] p-1.5 rounded-r-xl shadow-[8px_4px_20px_rgba(0,0,0,0.2)] border border-white/20 border-l-0 z-50 origin-left"
                   >
                     <button 
                       onClick={() => { setTheme('light'); setIsThemeMenuExpanded(false); }}
                       className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                         theme === 'light' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                       }`}
                       title="Light Theme"
                     >
                        <Sun size={16} strokeWidth={2} />
                     </button>
                     <button 
                       onClick={() => { setTheme('dark'); setIsThemeMenuExpanded(false); }}
                       className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                         theme === 'dark' ? 'bg-white text-[#009f75] shadow-sm' : 'text-white hover:bg-white/10'
                       }`}
                       title="Dark Theme"
                     >
                        <Moon size={16} strokeWidth={2} />
                     </button>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>
             
             <button 
               onClick={() => setIsSettingsOpen(true)}
               className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-[#11b585] text-white transition-all hover:brightness-110 mb-2 shadow-inner"
             >
                <Settings size={16} strokeWidth={2} />
             </button>
             
             <button 
               onClick={() => setViewMode('trash')}
               className={`flex h-8 w-8 items-center justify-center rounded-[12px] bg-[#11b585] transition-all hover:brightness-110 mt-1 shadow-inner ${
                 viewMode === 'trash' ? 'text-red-500 bg-white/10' : 'text-white'
               }`}
               title="Trash"
             >
                <Trash2 size={16} strokeWidth={2.5} />
             </button>
          </div>
        </div>

        {/* --- Sidebar Wrapper --- */}
        <div 
          className="relative flex shrink-0 transition-all duration-300 ease-in-out"
          style={{ width: isSidebarOpen ? `${sidebarWidth}px` : '0px' }}
        >
          {/* Toggle Sidebar Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute -right-5 top-1/2 -translate-y-1/2 w-5 h-16 bg-white border border-[#dce0e5] border-l-0 rounded-r-xl shadow-sm flex items-center justify-center text-gray-500 hover:text-[#009f75] hover:bg-gray-50 z-50 transition-colors cursor-pointer"
            title={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>

          {/* --- Sidebar (Navigation Rail) --- */}
          <aside 
            className={`flex flex-col border-r transition-colors duration-300 z-20 w-full h-full overflow-hidden ${
              theme === 'dark' ? 'bg-[#1e2022] border-[#2d2f31]' : 'bg-[#f0f2f5] border-[#e2e5e9]'
            }`}
          >
            <div className="flex flex-col h-full overflow-hidden" style={{ width: `${sidebarWidth}px` }}>
              {/* Sidebar Resize Handle */}
              <div 
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizingSidebar(true);
                }}
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#009f75]/30 transition-colors z-[60]"
              />

              {/* AI Refinement Panel inside Left Sidebar */}
              <AnimatePresence>
                {isIntelligenceInstructionsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`border-b group/refinement flex flex-col pt-3 pb-4 shrink-0 overflow-hidden ${
                      theme === 'dark' ? 'border-[#2d2f31]' : 'border-[#e2e5e9]'
                    }`}
                  >
                    <div className="px-4 flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <Target size={14} className="text-amber-600 animate-pulse" />
                        <span className={`text-[11px] font-black uppercase tracking-wider ${
                          theme === 'dark' ? 'text-amber-500' : 'text-amber-800'
                        }`}>AI Refinement Focus</span>
                      </div>
                      
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {selectedRefinementIds.length > 0 && (
                          <button
                            onClick={() => setSelectedRefinementIds([])}
                            className="text-[9px] font-black tracking-wider text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded transition-all"
                            id="clear-refinement-selection-btn"
                          >
                            CLEAR ({selectedRefinementIds.length})
                          </button>
                        )}
                        {!isAddingRefinement && (
                          <button
                            onClick={() => setIsAddingRefinement(true)}
                            className="flex h-6 items-center space-x-1 px-2.5 rounded-full bg-[#ebf5f1]/50 text-[#009f75] hover:bg-[#d1e9e0] transition-all disabled:opacity-50"
                            title="Create new direct preset"
                            id="sidebar-create-preset-btn"
                          >
                            <Plus size={12} strokeWidth={3} />
                            <span className="text-[10px] font-bold">New</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Interactive Input for direct creation */}
                    {isAddingRefinement && (
                      <div className="px-4 mb-3 shrink-0">
                        <div className="p-2.5 bg-white dark:bg-[#1a1b1d] border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm animate-in slide-in-from-top-1 duration-200">
                          <textarea 
                            value={newRefinementInstruction}
                            onChange={(e) => setNewRefinementInstruction(e.target.value)}
                            placeholder="Type a focus instruction (e.g. Focus on short-term support levels)..."
                            className="w-full text-xs p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:border-[#009f75] focus:ring-1 focus:ring-[#009f75] bg-white dark:bg-[#1f2123] dark:text-white font-semibold resize-none h-16 outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (newRefinementInstruction.trim()) {
                                  handleAddCustomRefinement(newRefinementInstruction);
                                  setNewRefinementInstruction('');
                                  setIsAddingRefinement(false);
                                }
                              } else if (e.key === 'Escape') {
                                setNewRefinementInstruction('');
                                setIsAddingRefinement(false);
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex items-center space-x-1 justify-end mt-1.5">
                            <button
                              onClick={() => {
                                if (newRefinementInstruction.trim()) {
                                  handleAddCustomRefinement(newRefinementInstruction);
                                  setNewRefinementInstruction('');
                                  setIsAddingRefinement(false);
                                }
                              }}
                              className="px-2.5 py-1 rounded bg-[#009f75] hover:bg-[#008f65] text-white text-[10px] font-black tracking-wider transition-all"
                            >
                              SAVE PRESET
                            </button>
                            <button
                              onClick={() => {
                                setNewRefinementInstruction('');
                                setIsAddingRefinement(false);
                              }}
                              className="px-2 py-1 rounded border border-gray-200 dark:border-gray-800 text-gray-400 hover:text-gray-600 bg-white dark:bg-[#1f2123] text-[10px] font-bold transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Presets Toggle List */}
                    <div className="px-4">
                      {customRefinements.length === 0 ? (
                        <p className="text-[10px] text-gray-400 italic px-1 leading-snug">No focus presets in database. Click "CREATE DIRECT PRESET" to add one.</p>
                      ) : (
                        <div className="flex flex-col space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-0.5" id="presets-list-sidebar">
                          {customRefinements.map((refItem) => {
                            const isSelected = selectedRefinementIds.includes(refItem.id);
                            const isCurrentlyEditing = editingRefinementId === refItem.id;

                            return (
                              <div 
                                key={refItem.id} 
                                className={`group/item flex flex-col px-2.5 py-1.5 rounded-lg text-[11px] border transition-all cursor-pointer select-none ${
                                  isSelected 
                                    ? 'bg-amber-500/10 text-amber-805 border-amber-500/80 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/80 shadow-xs' 
                                    : 'bg-white dark:bg-[#1c1e20] text-gray-600 dark:text-gray-300 border-gray-200/85 dark:border-gray-800/80 hover:border-gray-300 hover:bg-gray-50/50'
                                }`}
                                onClick={() => {
                                  if (!isCurrentlyEditing) {
                                    setSelectedRefinementIds(prev => 
                                      prev.includes(refItem.id) 
                                        ? prev.filter(id => id !== refItem.id) 
                                        : [...prev, refItem.id]
                                    );
                                  }
                                }}
                              >
                                {isCurrentlyEditing ? (
                                  <div className="flex items-center space-x-1 w-full" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                      type="text"
                                      value={editingRefinementText}
                                      onChange={(e) => setEditingRefinementText(e.target.value)}
                                      className="flex-1 px-1.5 py-0.5 text-[11px] text-black dark:text-white bg-white dark:bg-gray-800 border rounded focus:outline-none focus:ring-1 focus:ring-[#009f75] font-semibold min-w-0"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleUpdateCustomRefinement(refItem.id, editingRefinementText);
                                        } else if (e.key === 'Escape') {
                                          setEditingRefinementId(null);
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleUpdateCustomRefinement(refItem.id, editingRefinementText)}
                                      className="p-1 hover:text-[#009f75] text-[#009f75]/80 transition-all shrink-0"
                                      title="Save change"
                                    >
                                      <Check size={11} className="stroke-[3]" />
                                    </button>
                                    <button
                                      onClick={() => setEditingRefinementId(null)}
                                      className="p-1 hover:text-red-500 text-gray-400 transition-all shrink-0"
                                      title="Cancel"
                                    >
                                      <RotateCcw size={11} className="stroke-[3]" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center space-x-2 w-full">
                                      <span className={`w-3 h-3 rounded-full border flex items-center justify-center text-[7px] font-black transition-all shrink-0 ${
                                        isSelected 
                                          ? 'bg-amber-600 border-amber-600 text-white' 
                                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-[#252729]'
                                      }`}>
                                        {isSelected && '✓'}
                                      </span>

                                      <span 
                                        className="flex-1 leading-snug break-words pr-1 font-semibold flex items-center flex-wrap gap-1"
                                        title="Click to toggle selection"
                                      >
                                        <span>{refItem.instruction}</span>
                                        {refItem.elaborated_prompt && refItem.elaborated_prompt.trim() && (
                                          <span className="px-1 py-0.2 rounded-sm text-[8px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 font-bold border border-emerald-100/50 dark:border-emerald-900/40 select-none scale-90 origin-left">
                                            ELABORATED
                                          </span>
                                        )}
                                      </span>

                                      <div className={`flex items-center space-x-1 pl-1 border-l border-gray-100 dark:border-gray-800 shrink-0 transition-opacity ${deletingRefinementId === refItem.id || editingElaboratedId === refItem.id ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`}>
                                        {deletingRefinementId === refItem.id ? (
                                          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              onClick={() => handleDeleteCustomRefinement(refItem.id)}
                                              className="p-0.5 text-[#009f75] hover:text-[#007f5d] transition-all"
                                              title="Confirm delete"
                                            >
                                              <Check size={11} className="stroke-[3]" />
                                            </button>
                                            <button
                                              onClick={() => setDeletingRefinementId(null)}
                                              className="p-0.5 text-gray-400 hover:text-red-500 transition-all"
                                              title="Cancel delete"
                                            >
                                              <RotateCcw size={10} />
                                            </button>
                                          </div>
                                        ) : (
                                          <>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (editingElaboratedId === refItem.id) {
                                                  setEditingElaboratedId(null);
                                                } else {
                                                  setEditingElaboratedId(refItem.id);
                                                  setElaboratedPromptText(refItem.elaborated_prompt || '');
                                                }
                                              }}
                                              className={`p-0.5 transition-all ${
                                                refItem.elaborated_prompt && refItem.elaborated_prompt.trim()
                                                  ? 'text-emerald-500 hover:text-emerald-600' 
                                                  : 'text-gray-400 hover:text-amber-500'
                                              }`}
                                              title={refItem.elaborated_prompt && refItem.elaborated_prompt.trim() ? "Edit detailed instruction prompt" : "Add detailed instruction prompt"}
                                            >
                                              <FileText size={10} />
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingRefinementId(refItem.id);
                                                setEditingRefinementText(refItem.instruction);
                                              }}
                                              className="p-0.5 text-gray-400 hover:text-blue-500 transition-all"
                                              title="Edit"
                                              id={`edit-preset-btn-${refItem.id}`}
                                            >
                                              <Pencil size={10} />
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDeletingRefinementId(refItem.id);
                                              }}
                                              className="p-0.5 text-gray-400 hover:text-red-500 transition-all"
                                              title="Delete"
                                              id={`delete-preset-btn-${refItem.id}`}
                                            >
                                              <Trash2 size={10} />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {editingElaboratedId === refItem.id && (
                                      <div 
                                        className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800/80 flex flex-col space-y-1.5 w-full cursor-default select-text"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="text-[9px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest flex items-center gap-1">
                                            <Sparkles size={9} /> Complete Prompt
                                          </span>
                                          {refItem.elaborated_prompt && refItem.elaborated_prompt.trim() && (
                                            <button
                                              onClick={() => {
                                                if (confirm('Are you sure you want to clear the elaborated prompt and fallback to the heading?')) {
                                                  handleUpdateCustomRefinementElaborated(refItem.id, refItem.instruction, null);
                                                }
                                              }}
                                              className="text-[8px] text-red-500 hover:text-red-600 underline font-black uppercase tracking-wider"
                                            >
                                              Clear
                                            </button>
                                          )}
                                        </div>
                                        <textarea
                                          value={elaboratedPromptText}
                                          onChange={(e) => setElaboratedPromptText(e.target.value)}
                                          placeholder="Type the full, detailed prompt instruction for the AI to consider when this focus is selected..."
                                          className="w-full h-24 p-1.5 text-[10px] leading-relaxed text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 rounded focus:ring-1 focus:ring-amber-500 focus:outline-none focus:border-transparent custom-scrollbar"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') {
                                              setEditingElaboratedId(null);
                                            }
                                          }}
                                        />
                                        <div className="flex items-center justify-end space-x-1.5 pt-0.5">
                                          <button
                                            onClick={() => setEditingElaboratedId(null)}
                                            className="px-2 py-1 text-[9px] font-bold rounded text-gray-400 hover:text-gray-650 hover:bg-gray-100 dark:hover:bg-gray-800/50 uppercase tracking-wide transition-all"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={() => handleUpdateCustomRefinementElaborated(refItem.id, refItem.instruction, elaboratedPromptText)}
                                            className="px-2.5 py-1 text-[9px] font-bold rounded bg-amber-500 hover:bg-amber-600 text-white shadow-xs uppercase tracking-wide flex items-center space-x-1 transition-all"
                                          >
                                            <Check size={9} className="stroke-[3]" />
                                            <span>Save</span>
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

        {/* Market Sections */}
        <div className="px-4 mb-2 mt-4 flex items-center justify-between">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#6c7d8f]">Market Sections</h3>
          <button 
            onClick={() => setAddingToParentId('root')}
            disabled={isAddingCategory}
            className="flex h-6 items-center space-x-1 px-2.5 rounded-full bg-[#ebf5f1]/50 text-[#009f75] hover:bg-[#d1e9e0] transition-all disabled:opacity-50"
            title="Add New Section"
          >
            <Plus size={12} strokeWidth={3} />
            <span className="text-[10px] font-bold">Add</span>
          </button>
        </div>

        {addingToParentId === 'root' && (() => {
          const isDuplicate = isDuplicateName(newCategoryName, null);
          return (
            <div className="px-3 mb-3">
              <div className={`flex items-center space-x-1 bg-white p-1 rounded-xl border shadow-sm ${isDuplicate ? 'border-red-400 focus-within:border-red-500' : 'border-[#dce0e5]'}`}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Section name..."
                  className="flex-1 bg-transparent text-[13px] font-medium text-gray-700 px-2 py-1 outline-none"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCategory();
                    if (e.key === 'Escape') setAddingToParentId(null);
                  }}
                />
                <button 
                  onClick={handleAddCategory}
                  className={`p-1 rounded-lg ${isDuplicate ? 'text-gray-400 cursor-not-allowed' : 'text-[#009f75] hover:bg-[#ebf5f1]'}`}
                  disabled={isDuplicate}
                >
                  <Check size={16} strokeWidth={2.5} />
                </button>
              </div>
              {isDuplicate && (
                <div className="text-[10px] text-red-500 mt-1 pl-1 font-medium">This section name already exists.</div>
              )}
            </div>
          );
        })()}

        <nav className="flex flex-1 flex-col space-y-1.5 px-3 overflow-y-auto pb-4 pt-1">
          {categories.filter(c => !c.parent_id).map((cat) => {
            const subCats = categories.filter(c => c.parent_id === cat.id);
            const isExpanded = expandedCategories[cat.id];
            
            return (
              <div key={cat.id} className="flex flex-col space-y-1">
                <div
                  className={`group relative flex items-center justify-between px-2 py-1 rounded-md transition-all cursor-pointer border ${
                    activeCategory === cat.name 
                      ? 'bg-white border-[#dce0e5] shadow-sm' 
                      : 'bg-[#f8f9fa] border-transparent hover:bg-white hover:border-[#dce0e5] hover:shadow-sm'
                  }`}
                  onClick={() => {
                    setActiveCategory(cat.name);
                    setActiveCategoryId(cat.id);
                    setSelectedNews(null);
                    setSelectedReport(null);
                    toggleCategory(cat.id);
                  }}
                >
                  <div className="flex items-center">
                    <div 
                      onClick={(e) => toggleCategorySelection(e, cat.id)}
                      className={`mr-2.5 flex h-[14px] w-[14px] shrink-0 flex-col items-center justify-center rounded-[3px] border ${
                        selectedCategoryIds.has(Number(cat.id)) 
                          ? 'border-[#009f75] bg-[#009f75] text-white' 
                          : 'border-[#cdd3d9] hover:border-[#009f75] bg-white'
                      }`}
                    >
                      {selectedCategoryIds.has(Number(cat.id)) && <Check size={10} strokeWidth={3.5} />}
                    </div>
                    <ChevronRight size={13} strokeWidth={2.5} className={`mr-2 text-[#9ba4af] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    {editingCategoryId === cat.id ? (() => {
                      const isDuplicate = isDuplicateName(editingCategoryName, cat.parent_id || null, cat.id);
                      return (
                        <input
                          autoFocus
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onBlur={() => { if (!isDuplicate) handleEditCategory(cat.id); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (!isDuplicate) handleEditCategory(cat.id);
                            }
                            if (e.key === 'Escape') setEditingCategoryId(null);
                          }}
                          className={`bg-white px-1 -ml-1 text-[11px] font-extrabold tracking-wide uppercase truncate outline-none border rounded w-24 ${isDuplicate ? 'border-red-500 text-red-600' : 'border-[#009f75] text-[#394a5a]'}`}
                          onClick={(e) => e.stopPropagation()}
                          title={isDuplicate ? 'Name already exists' : ''}
                        />
                      );
                    })() : (
                      <span className={`text-[11px] font-extrabold tracking-wide uppercase truncate ${
                        activeCategory === cat.name ? 'text-[#394a5a]' : 'text-[#6c7d8f]'
                      }`}>{cat.name}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-1 ml-auto">
                    {/* Header/Footer Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHfEditingCategory(cat);
                        setHfHeader(cat.header_text || '');
                        setHfFooter(cat.footer_text || '');
                        setIsHfHeaderActive(cat.is_header_active === 1);
                        setIsHfFooterActive(cat.is_footer_active === 1);
                        setIsHeaderFooterModalOpen(true);
                      }}
                      className="p-1 rounded-md text-[#9ba4af] hover:text-[#009f75] hover:bg-[#ebf5f1] transition-colors"
                      title="Header & Footer Settings"
                    >
                      <PanelTop size={13} strokeWidth={2} />
                    </button>
                    
                    {/* Add Sub-section Button mapped from the + */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setAddingToParentId(cat.id);
                        setNewCategoryName('');
                        if (!expandedCategories[cat.id]) {
                          toggleCategory(cat.id);
                        }
                      }}
                      className="p-1 rounded-md text-[#9ba4af] hover:text-[#009f75] hover:bg-[#ebf5f1] transition-colors"
                      title="Add Sub-section"
                    >
                      <Plus size={13} strokeWidth={3} />
                    </button>
                    
                    {/* Expand/Collapse logic handled by ChevronRight click, but keeping the button for UI balance or removing it */}
                    {/* We removed the explicit arrow button since it's now visually on the left, but let's keep an icon placeholder if needed */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCategoryId(cat.id);
                        setEditingCategoryName(cat.name);
                      }}
                      className="p-1 rounded-md text-[#9ba4af] hover:text-[#009f75] hover:bg-[#ebf5f1] transition-colors" title="Edit Section"
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Sub-category Input */}
                {addingToParentId === cat.id && (() => {
                  const isDuplicate = isDuplicateName(newCategoryName, cat.id);
                  return (
                    <div className="ml-7 pr-3 py-1">
                      <div className={`flex items-center space-x-1 bg-white p-1 rounded-lg border shadow-sm ${isDuplicate ? 'border-red-400 focus-within:border-red-500' : 'border-[#dce0e5]'}`}>
                        <input
                          autoFocus
                          type="text"
                          placeholder="Sub-section name..."
                          className="flex-1 bg-transparent text-[12px] font-bold text-gray-700 px-2 py-1 outline-none"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isDuplicate) handleAddSubCategory(cat.id);
                            if (e.key === 'Escape') setAddingToParentId(null);
                          }}
                        />
                        <button 
                          onClick={() => handleAddSubCategory(cat.id)}
                          className={`p-1 rounded ${isDuplicate ? 'text-gray-400 cursor-not-allowed' : 'text-[#009f75] hover:bg-[#ebf5f1]'}`}
                          disabled={isDuplicate}
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>
                      </div>
                      {isDuplicate && (
                        <div className="text-[10px] text-red-500 mt-0.5 font-medium">This sub-section name already exists.</div>
                      )}
                    </div>
                  );
                })()}

                {/* Sub-categories */}
                {isExpanded && subCats.length > 0 && (
                  <div className="ml-[1.4rem] flex flex-col space-y-1 mb-1 relative before:absolute before:left-[7px] before:top-0 before:bottom-3 before:w-[2px] before:bg-[#e2e5e9]">
                    {subCats.map((sub) => (
                      <div
                        key={sub.id}
                        onClick={() => {
                          setActiveCategory(sub.name);
                          setActiveCategoryId(sub.id);
                          setSelectedNews(null);
                          setSelectedReport(null);
                        }}
                        className={`flex items-center pl-7 pr-3 py-1 rounded-md transition-all relative cursor-pointer ${
                          activeCategory === sub.name 
                            ? 'bg-[#ebf5f1] text-[#009f75]' 
                            : 'text-[#6c7d8f] hover:bg-white hover:text-[#394a5a] hover:shadow-sm hover:border-[#dce0e5] border border-transparent'
                        }`}
                      >
                        <div className="absolute left-[7px] top-1/2 -translate-y-1/2 w-3 h-[2px] bg-[#e2e5e9]"></div>
                        <div 
                          onClick={(e) => toggleCategorySelection(e, sub.id)}
                          className={`mr-2.5 shrink-0 flex h-[13px] w-[13px] items-center justify-center rounded-[3px] border ${
                            selectedCategoryIds.has(Number(sub.id)) 
                              ? 'border-[#009f75] bg-[#009f75] text-white' 
                              : 'border-[#cdd3d9] hover:border-[#009f75] bg-white'
                          }`}
                        >
                          {selectedCategoryIds.has(Number(sub.id)) && <Check size={10} strokeWidth={3.5} />}
                        </div>
                        {editingCategoryId === sub.id ? (() => {
                          const isDuplicate = isDuplicateName(editingCategoryName, sub.parent_id || null, sub.id);
                          return (
                            <input
                              autoFocus
                              type="text"
                              value={editingCategoryName}
                              onChange={(e) => setEditingCategoryName(e.target.value)}
                              onBlur={() => { if (!isDuplicate) handleEditCategory(sub.id); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (!isDuplicate) handleEditCategory(sub.id);
                                }
                                if (e.key === 'Escape') setEditingCategoryId(null);
                              }}
                              className={`bg-white px-1 -ml-1 text-[11px] font-medium truncate outline-none border rounded w-24 ${isDuplicate ? 'border-red-500 text-red-600' : 'border-[#009f75] text-[#394a5a]'}`}
                              onClick={(e) => e.stopPropagation()}
                              title={isDuplicate ? 'Name already exists' : ''}
                            />
                          );
                        })() : (
                          <span className="text-[11px] font-medium truncate">{sub.name}</span>
                        )}
                        <div className="ml-auto flex items-center space-x-0.5">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCategoryId(sub.id);
                              setEditingCategoryName(sub.name);
                            }}
                            className={`p-1 rounded-md transition-colors ${
                               activeCategory === sub.name ? 'text-[#009f75] hover:bg-[#d1e9e0]' : 'text-[#9ba4af] hover:text-[#009f75] hover:bg-[#ebf5f1]'
                            }`}
                            title="Edit Sub-section"
                          >
                            <Pencil size={11} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          
          <div className="h-px bg-gray-200 my-4 mx-2" />
          
          {/* Bottom Pinned Raw Input Area */}
          <div className="mt-auto px-2 pb-2">
            <div className={`border-2 border-[#009f75] rounded-xl shadow-sm flex flex-col overflow-hidden focus-within:ring-2 focus-within:ring-[#009f75] focus-within:ring-opacity-50 transition-all ${
              theme === 'dark' ? 'bg-[#232527]' : 'bg-white'
            }`}>
              {inputImages.length > 0 && (
                <div className="p-2 flex flex-wrap gap-1.5 border-b border-gray-100 bg-gray-50/50 max-h-24 overflow-y-auto">
                  {inputImages.map((img, idx) => (
                    <div key={idx} className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 group bg-white shadow-xs">
                      <img src={img} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setInputImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0 right-0 p-0.5 bg-red-500 text-white rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={8} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handleInputImagePaste}
                className={`w-full h-24 p-3 resize-none border-none bg-transparent text-sm outline-none font-medium custom-scrollbar ${
                  theme === 'dark' ? 'text-gray-200 placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
                }`}
                placeholder={activeCategory ? `Paste ${activeCategory} news...` : "Raw input..."}
              />
              <div className={`flex justify-between items-center px-3 py-2 border-t transition-colors ${
                theme === 'dark' ? 'bg-[#1e2022] border-[#2d2f31]' : 'bg-gray-50 border-gray-100'
              }`}>
                <div className="flex items-center space-x-2">
                  <select 
                    value={demoDaysAgo}
                    onChange={(e) => setDemoDaysAgo(parseInt(e.target.value))}
                    className="bg-transparent text-[10px] font-bold text-[#009f75] outline-none cursor-pointer pr-1"
                    title="Days Ago"
                  >
                    {[...Array(31)].map((_, i) => (
                       <option key={i} value={i}>{i === 0 ? 'Today' : i + 'd ago'}</option>
                    ))}
                  </select>
                  <div className="w-[1px] h-3 bg-gray-300" />
                  <input
                    type="file"
                    id="main-image-upload"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleInputImageUpload}
                  />
                  <button
                    onClick={() => document.getElementById('main-image-upload')?.click()}
                    className="text-gray-400 hover:text-[#009f75] transition-colors relative"
                    title="Attach Images"
                  >
                    <ImageIcon size={14} />
                    {inputImages.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-[#009f75] text-white text-[7px] font-black w-3 h-3 rounded-full flex items-center justify-center border border-white">
                        {inputImages.length}
                      </span>
                    )}
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    type="button"
                    onClick={handleAddDemoNews}
                    disabled={isProcessing}
                    className="p-1 rounded text-gray-400 hover:text-[#009f75] hover:bg-[#ebf5f1] transition-colors disabled:opacity-50"
                    title="Add Demo News"
                  >
                    <Database size={14} />
                  </button>
                  <button 
                    type="button"
                    onClick={handleProcess}
                    disabled={isProcessing || !inputText.trim()}
                    className="flex justify-center items-center rounded bg-[#009f75] w-[50px] h-6 text-[11px] font-bold text-white shadow-sm hover:bg-[#008f69] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <span>Add</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>


        </div>
      </aside>
      </div>

      {/* --- Main Dashboard Area --- */}
      <main 
        ref={containerRef}
        className={`flex flex-1 overflow-hidden ${isResizing ? 'cursor-col-resize select-none' : ''}`}
      >
        {/* Left Panel: Raw News Feed / Input */}
        <div 
          className={`flex flex-col border-r transition-all duration-300 ease-in-out relative ${
            maximizedPanel === 'right' ? 'hidden' : ''
          } ${
            theme === 'dark' ? 'bg-[#1a1c1e] border-[#2d2f31]' : 'bg-[#F7F5F2] border-[#dce0e5]'
          }`}
          style={{ width: maximizedPanel === 'left' ? '100%' : maximizedPanel === 'right' ? '0%' : `${leftWidth}%` }}
        >
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />
          {/* Toolbar */}
          <header className={`flex h-12 shrink-0 items-center justify-between border-b px-4 transition-colors duration-300 ${
            theme === 'dark' ? 'bg-[#232527] border-[#2d2f31] text-gray-200' : 'bg-[#f0f2f5] border-[#dce0e5] text-[#394a5a]'
          }`}>
            <div className="flex items-center space-x-3 flex-1 overflow-x-auto no-scrollbar">
              <div className="flex items-center space-x-3 pr-4 border-r border-[#dce0e5] h-6">
                <button 
                  onClick={() => toggleMaximize('left')}
                  className={`p-1 rounded-lg transition-colors ${
                    maximizedPanel === 'left' 
                      ? 'bg-[#dce0e5] text-[#394a5a]' 
                      : 'text-[#6c7d8f] hover:bg-[#dce0e5] hover:text-[#394a5a]'
                  }`}
                >
                  <Maximize2 size={14} />
                </button>
                <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-[#394a5a] whitespace-nowrap">
                  {viewMode === 'trash' ? `Trash Bin` : activeCategory}
                </h2>
              </div>

              {selectedNews && viewMode === 'intelligence' && (
                <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-left-2 duration-300">

                  {/* Language selection moved to vertical bar */}
                  {/* Format selection moved to vertical bar */}
                  {/* Layout selection moved to vertical bar */}

                  {/* Refinement triggers directly */}
                  <button 
                    onClick={() => handleRefine(selectedNews)}
                    disabled={isRefining}
                    className="flex items-center justify-center bg-[#009f75] text-white p-1.5 rounded-lg text-xs font-black shadow-sm hover:bg-[#008f65] transition-all disabled:opacity-50"
                  >
                    {isRefining ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3 ml-4">
              {viewMode === 'intelligence' && (
                <div className={`flex items-center p-0.5 rounded-lg border shadow-xs ${
                  theme === 'dark' ? 'bg-[#2d2f31]/90 border-[#3d4144]' : 'bg-gray-100/85 border-gray-200/85'
                }`}>
                  <button 
                    onClick={() => setFeedFilter('all')}
                    className={`px-3 py-1 rounded-[6px] text-[9px] font-black tracking-widest transition-all ${
                      feedFilter === 'all' 
                        ? 'bg-[#009f75] text-white shadow-xs' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-white/10'
                    }`}
                  >
                    ALL
                  </button>
                  <button 
                    onClick={() => setFeedFilter('refined')}
                    className={`px-3 py-1 rounded-[6px] text-[9px] font-black tracking-widest transition-all ${
                      feedFilter === 'refined' 
                        ? 'bg-[#009f75] text-white shadow-xs' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-white/10'
                    }`}
                  >
                    REFINED
                  </button>
                  <button 
                    onClick={() => setFeedFilter('raw')}
                    className={`px-3 py-1 rounded-[6px] text-[9px] font-black tracking-widest transition-all ${
                      feedFilter === 'raw' 
                        ? 'bg-[#009f75] text-white shadow-xs' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-white/10'
                    }`}
                  >
                    RAW
                  </button>
                </div>
              )}
              {viewMode === 'trash' && (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setViewMode('intelligence')}
                    className={`flex items-center space-x-2 px-4 py-1.5 rounded-md text-xs font-black transition-all border ${
                      theme === 'dark' 
                        ? 'bg-white/10 text-white hover:bg-white/20 border-white/20' 
                        : 'bg-[#009f75] text-white hover:bg-[#008f65] border-[#009f75] shadow-sm'
                    }`}
                  >
                    <RotateCcw size={14} />
                    <span>Exit Trash</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          
          <div className="flex-1 flex flex-col overflow-hidden">
            {viewMode === 'intelligence' ? (
              <div className="flex flex-col relative z-10 flex-1 overflow-hidden">
                {/* History Feed */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    {isLoadingFeed ? (
                      <div className="flex justify-center py-8">
                        <Loader2 size={24} className="animate-spin text-gray-400" />
                      </div>
                    ) : sortedDateStrings.length === 0 ? (
                      <div className="text-center py-12 text-gray-500 italic text-sm font-medium">
                        No news entries found for this selection.
                      </div>
                    ) : (
                      sortedDateStrings.map((dateStr) => (
                        <div key={dateStr} className="space-y-4">
                          <div className="flex items-center space-x-4 px-2">
                            <span className="text-[10px] font-black text-gray-400 tracking-[0.2em]">{formatDateHeading(dateStr)}</span>
                            <div className={`h-[1px] flex-1 ${theme === 'dark' ? 'bg-[#2d2f31]' : 'bg-gray-200'}`} />
                          </div>
                          
                          <div className="space-y-4">
                            {newsGroups[dateStr]
                              .filter(item => !isStarredOnly || starredNewsIds.has(item.id))
                              .map((item) => (
                              <div
                                key={item.id}
                                className={`group relative w-full p-4 pl-12 rounded-xl border-2 transition-all cursor-pointer flex flex-col ${
                                  selectedNews?.id === item.id 
                                    ? (theme === 'dark' ? 'border-[#009f75] bg-[#009f75]/10 shadow-lg' : 'border-[#009f75] bg-green-50 shadow-md')
                                    : (theme === 'dark' ? 'border-[#2d2f31] bg-[#232527] hover:border-[#3d3f41] hover:bg-[#2a2c2e]' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50')
                                } ${expandedNewsIds.has(item.id) ? 'h-64' : 'h-auto'}`}
                                onClick={() => {
                                  setSelectedNews(item);
                                  setSelectedReport(null);
                                }}
                              >
                                {/* Front Controls: Selection & Star */}
                                <div className="absolute left-3 top-4 flex flex-col items-center space-y-3 z-10">
                                  <button
                                    onClick={(e) => handleToggleSelect(item.id, e)}
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                      selectedNewsIds.has(item.id)
                                        ? 'bg-[#009f75] border-[#009f75] text-white shadow-sm'
                                        : theme === 'dark' ? 'border-[#3d3f41] hover:border-[#009f75]' : 'border-gray-300 hover:border-[#009f75]'
                                    }`}
                                  >
                                    {selectedNewsIds.has(item.id) && <Check size={14} strokeWidth={3} />}
                                  </button>
                                  <button
                                    onClick={(e) => handleToggleStar(item.id, e)}
                                    className={`transition-all hover:scale-110 ${
                                      starredNewsIds.has(item.id)
                                        ? 'text-yellow-500 fill-yellow-500'
                                        : 'text-gray-300 hover:text-yellow-400'
                                    }`}
                                    title={starredNewsIds.has(item.id) ? "Unstar" : "Star"}
                                  >
                                    <Star size={18} fill={starredNewsIds.has(item.id) ? 'currentColor' : 'none'} />
                                  </button>
                                </div>

                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className={`text-xs font-mono font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-700'}`}>
                                      {parseSafeDate(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}, {parseSafeDate(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {item.type === 'refined' && (
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter flex items-center ${
                                        theme === 'dark' ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-700'
                                      }`}>
                                        <ChevronRight size={10} className="mr-0.5" />
                                        Refined from #{item.parent_id}
                                      </span>
                                    )}
                                    {item.type === 'raw' && (
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter flex items-center ${
                                        theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                                      }`}>
                                        Raw #{item.id}
                                        {item.images && item.images.length > 0 && (
                                          <div className="flex items-center ml-1.5 pl-1.5 border-l border-current/20">
                                            <ImageIcon size={9} className="mr-1" />
                                            <span className="tabular-nums font-black">{item.images.length}</span>
                                          </div>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {item.summary_en && (
                                      <span className="text-[10px] bg-[#009f75] text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow-sm">Refined</span>
                                    )}
                                    <button
                                      onClick={(e) => toggleExpandNews(item.id, e)}
                                      className={`p-1 rounded-md transition-colors ${expandedNewsIds.has(item.id) ? 'bg-[#ebf5f1] text-[#009f75]' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                                      title={expandedNewsIds.has(item.id) ? "Collapse" : "Expand"}
                                    >
                                      {expandedNewsIds.has(item.id) ? <ChevronDown size={16} /> : <Maximize2 size={14} />}
                                    </button>
                                    <button 
                                      onClick={(e) => handleEditNews(item, e)}
                                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-[#009f75] transition-all"
                                      title="Edit News"
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveToTrash(item.id, 'news');
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all"
                                      title="Move to Trash"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                                <div className={`text-sm text-gray-900 leading-relaxed font-medium overflow-y-auto custom-scrollbar ${expandedNewsIds.has(item.id) ? 'flex-1 pr-2' : 'line-clamp-2 overflow-hidden'}`}>
                                  {getNewsPreviewText(item)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                </div>
            </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden relative z-10">
                <div className="p-4 border-b border-gray-300 bg-[#f0f2f5]">
                  <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-900">Trash Bin</h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Items here will be permanently deleted if you choose.</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {/* Deleted News */}
                  <section>
                    <div className="flex items-center space-x-2 px-2 mb-3">
                      <Send size={14} className="text-gray-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Deleted Intelligence</span>
                    </div>
                    {isLoadingTrash ? (
                      <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
                    ) : trashItems.news.length === 0 ? (
                      <p className="text-xs text-gray-400 italic px-2">No deleted news items.</p>
                    ) : (
                      <div className="space-y-2">
                        {trashItems.news.map(item => (
                          <div key={item.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-bold text-gray-600">{item.category}</span>
                                <span className="text-[10px] text-gray-400">{parseSafeDate(item.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-xs text-gray-900 truncate">{item.raw_text}</p>
                            </div>
                            <div className="flex items-center space-x-1">
                              <button 
                                onClick={() => handleRestore(item.id, 'news')}
                                className="p-1.5 text-gray-400 hover:text-[#009f75] hover:bg-green-50 rounded transition-all"
                                title="Restore"
                              >
                                <RotateCcw size={14} />
                              </button>
                              <button 
                                onClick={() => handlePermanentDelete(item.id, 'news')}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                title="Delete Permanently"
                              >
                                <Trash size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Deleted Reports */}
                  <section>
                    <div className="flex items-center space-x-2 px-2 mb-3">
                      <FileText size={14} className="text-gray-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Deleted Reports</span>
                    </div>
                    {isLoadingTrash ? (
                      <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
                    ) : trashItems.reports.length === 0 ? (
                      <p className="text-xs text-gray-400 italic px-2">No deleted reports.</p>
                    ) : (
                      <div className="space-y-2">
                        {trashItems.reports.map(report => (
                          <div key={report.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-bold text-gray-600">{report.category}</span>
                                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase">{report.type}</span>
                              </div>
                              <p className="text-xs text-gray-900 truncate">{report.category} {report.type} Report</p>
                            </div>
                            <div className="flex items-center space-x-1">
                              <button 
                                onClick={() => handleRestore(report.id, 'report')}
                                className="p-1.5 text-gray-400 hover:text-[#009f75] hover:bg-green-50 rounded transition-all"
                                title="Restore"
                              >
                                <RotateCcw size={14} />
                              </button>
                              <button 
                                onClick={() => handlePermanentDelete(report.id, 'report')}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                title="Delete Permanently"
                              >
                                <Trash size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        {!maximizedPanel && (
          <div 
            onMouseDown={startResizing}
            className={`group relative w-1.5 cursor-col-resize transition-colors hover:bg-[#009f75] ${isResizing ? 'bg-[#009f75]' : 'bg-gray-300'}`}
          />
        )}

        {/* Right Panel: Refined Intelligence */}
        <div 
          className={`flex flex-col relative transition-all duration-300 ease-in-out ${maximizedPanel === 'left' ? 'hidden' : 'flex-1'} ${
            theme === 'dark' ? 'bg-[#1a1c1e]' : 'bg-[#F7F5F2]'
          }`}
        >
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />
          {/* Toolbar */}
          <header className={`flex shrink-0 h-10 items-center border-b px-4 transition-colors duration-300 space-x-4 ${
            theme === 'dark' ? 'bg-[#232527] border-[#2d2f31]' : 'bg-[#f0f2f5] border-[#dce0e5]'
          }`}>
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => toggleMaximize('right')}
                className={`p-1 mt-0.5 rounded-lg transition-colors ${
                  maximizedPanel === 'right' 
                    ? 'bg-[#dce0e5] text-[#394a5a]' 
                    : 'text-[#6c7d8f] hover:bg-[#dce0e5] hover:text-[#394a5a]'
                }`}
              >
                <Maximize2 size={14} />
              </button>
            </div>

            {selectedNews && (
              <div className="flex items-center space-x-4 flex-1">
                <div className="flex items-center bg-gray-100/50 p-1 rounded-lg border border-gray-200 shadow-sm">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setPreviewMode('desktop'); }}
                    className={`p-2 rounded-lg transition-all ${
                      previewMode === 'desktop' ? 'bg-[#009f75] text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                    title="Desktop Preview"
                  >
                    <Monitor size={16} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setPreviewMode('whatsapp'); }}
                    className={`p-2 rounded-lg transition-all ${
                      previewMode === 'whatsapp' ? 'bg-[#009f75] text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                    title="WhatsApp Preview"
                  >
                    <MessageSquare size={16} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setPreviewMode('raw'); }}
                    className={`p-2 rounded-lg transition-all ${
                      previewMode === 'raw' ? 'bg-[#009f75] text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                    title="Raw Content"
                  >
                    <FileText size={16} />
                  </button>
                </div>
                
                <div className="flex-1" />
                
                <div className="flex items-center space-x-2 bg-white rounded-full px-3 py-1 shadow-sm border border-gray-200">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setNewsZoom(Math.max(0.5, newsZoom - 0.1)); }}
                    className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-[10px] font-bold text-gray-400 w-8 text-center">{Math.round(newsZoom * 100)}%</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setNewsZoom(Math.min(2, newsZoom + 0.1)); }}
                    className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>

                <div className={`h-4 w-[1px] ${theme === 'dark' ? 'bg-white/10' : 'bg-gray-300'}`} />
              </div>
            )}
          </header>
          
          {/* Content: Output Area with Plus Pattern */}
          <div className="flex-1 flex flex-col overflow-y-auto relative z-10">
            {selectedNews ? (
              <div className="flex-1 flex flex-col">
                {/* Refinement settings moved to middle panel */}

                {/* News Content Area */}
                <div className="p-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="max-w-2xl mx-auto">
                    {(selectedNews.summary_en || isRefining || previewMode === 'raw') ? (
                      previewMode === 'raw' ? (
                        <div className="flex flex-col space-y-6">
                           <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Source Material</h3>
                          </div>
                          <div 
                            className="bg-white p-8 rounded-3xl border-2 border-gray-100 shadow-xl shadow-gray-200/50 transition-all duration-300"
                            style={{ fontSize: `${14 * newsZoom}px`, lineHeight: 1.6 }}
                          >
                            <p className="text-gray-800 whitespace-pre-wrap font-medium">
                              {selectedNews.raw_text}
                            </p>
                            
                            {selectedNews.images && selectedNews.images.length > 0 && (
                              <div className="mt-8 grid grid-cols-2 gap-4">
                                {selectedNews.images.map((img, idx) => (
                                  <div key={idx} className="relative group rounded-2xl overflow-hidden border border-gray-200 shadow-sm transition-all hover:shadow-md">
                                    <img 
                                      src={img} 
                                      alt={`Source Attachment ${idx + 1}`} 
                                      className="w-full h-auto cursor-zoom-in" 
                                      onClick={() => window.open(img, '_blank')} 
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : previewMode === 'whatsapp' ? (
                        <div 
                          className="flex justify-center transition-all duration-300 relative my-8"
                          style={{ height: `${640 * newsZoom}px` }}
                        >
                          {/* Mobile Frame */}
                          <div 
                            className="relative w-[320px] h-[640px] bg-black rounded-[3rem] border-[8px] border-gray-800 shadow-2xl overflow-hidden flex-shrink-0 flex flex-col transition-transform duration-300 origin-top"
                            style={{ transform: `scale(${newsZoom})` }}
                          >
                            {/* Speaker/Camera Notch */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-2xl z-30 flex items-center justify-center">
                              <div className="w-8 h-1 bg-gray-700 rounded-full"></div>
                            </div>

                            {/* WhatsApp Header */}
                            <div className="bg-[#075E54] text-white pt-8 pb-3 px-4 flex items-center space-x-3 shadow-md z-20">
                              <ArrowLeft size={20} className="text-white" />
                              <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden border border-white/20">
                                <div className="w-full h-full bg-green-100 flex items-center justify-center text-green-800 font-bold">MI</div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold truncate">Market Intelligence</h3>
                                <p className="text-[10px] text-white/80">online</p>
                              </div>
                              <div className="flex items-center space-x-4">
                                <Video size={18} />
                                <Phone size={16} />
                                <MoreVertical size={18} />
                              </div>
                            </div>

                            {/* WhatsApp Chat Area */}
                            <div className="flex-1 overflow-y-auto bg-[#F7F5F2] relative p-3 space-y-2 custom-scrollbar">
                              <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"></div>
                              <div className="flex flex-col space-y-2 relative z-10">
                                <div className="flex justify-center my-2">
                                  <span className="bg-[#D1E4F0] text-[10px] font-bold text-gray-600 px-3 py-1 rounded-lg uppercase shadow-sm">Today</span>
                                </div>
                                <div className="max-w-[92%] self-start bg-white rounded-lg rounded-tl-none shadow-sm p-3 relative">
                                  <div className="absolute top-0 -left-2 w-2 h-3 bg-white" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}></div>
                                  
                                  {isRefining ? (
                                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                                      <div className="relative">
                                        <Loader2 size={32} className="animate-spin text-green-600" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <Sparkles size={12} className="text-green-800 animate-pulse" />
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-center">
                                        <span className="text-[11px] font-bold text-gray-600 animate-pulse">Gemini is synthesizing...</span>
                                        <div className="flex space-x-1 mt-1">
                                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      {/* Copy Button */}
                                      <motion.button 
                                        whileTap={{ scale: 0.85 }}
                                        whileHover={{ scale: 1.05 }}
                                        onClick={() => {
                                          const { header, footer } = getHFSettings(selectedNews.category_id);
                                          const en = selectedNews.summary_en || '';
                                          const hi = selectedNews.summary_hi || '';
                                          const content = refineOptions.order === 'hi-en' 
                                            ? `${hi}${hi && en ? '\n\n' : ''}${en}`
                                            : `${en}${en && hi ? '\n\n' : ''}${hi}`;
                                          const textToCopy = `${header ? header + '\n\n' : ''}${content}${footer ? '\n\n' + footer : ''}`.trim();
                                          handleCopy('news', selectedNews.id, textToCopy);
                                        }}
                                        className={`absolute top-1 right-1 p-1.5 rounded-md z-20 overflow-hidden relative cursor-pointer select-none transition-colors ${
                                          selectedNews.is_copied 
                                            ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' 
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                                        }`}
                                        title="Copy to WhatsApp"
                                      >
                                        <AnimatePresence mode="wait">
                                          {justCopiedId?.startsWith(`news-${selectedNews.id}`) ? (
                                            <motion.span
                                              key="success-pop"
                                              initial={{ scale: 0.5, opacity: 0 }}
                                              animate={{ scale: 1, opacity: 1 }}
                                              exit={{ scale: 0.5, opacity: 0 }}
                                              className="flex items-center justify-center text-green-650 dark:text-green-400 font-bold"
                                            >
                                              <Check size={14} className="stroke-[3]" />
                                            </motion.span>
                                          ) : (
                                            <motion.span
                                              key="normal-icon"
                                              initial={{ scale: 0.8, opacity: 0 }}
                                              animate={{ scale: 1, opacity: 1 }}
                                              exit={{ scale: 0.8, opacity: 0 }}
                                              className="flex items-center justify-center"
                                            >
                                              {selectedNews.is_copied ? <Check size={14} /> : <Copy size={14} />}
                                            </motion.span>
                                          )}
                                        </AnimatePresence>
                                        
                                        {/* Dynamic ripple overlay triggered on click */}
                                        <AnimatePresence>
                                          {justCopiedId?.startsWith(`news-${selectedNews.id}`) && (
                                            <motion.span 
                                              initial={{ opacity: 0.35, scale: 0.4 }}
                                              animate={{ opacity: 0, scale: 2.2 }}
                                              exit={{ opacity: 0 }}
                                              transition={{ duration: 0.45, ease: "easeOut" }}
                                              className="absolute inset-0 bg-green-500 rounded-full pointer-events-none"
                                            />
                                          )}
                                        </AnimatePresence>
                                      </motion.button>

                                      <div className="text-[14px] leading-relaxed text-gray-800 font-sans">
                                        <div className={`${!isWhatsAppExpanded ? 'line-clamp-[15]' : ''} transition-all duration-300`}>
                                          <Markdown>
                                            {formatForMarkdownPreview(
                                              (() => {
                                                const { header, footer } = getHFSettings(selectedNews.category_id);
                                                const en = selectedNews.summary_en || '';
                                                const hi = selectedNews.summary_hi || '';
                                                const content = refineOptions.order === 'hi-en' 
                                                  ? `${hi}${hi && en ? '\n\n' : ''}${en}`
                                                  : `${en}${en && hi ? '\n\n' : ''}${hi}`;
                                                
                                                return `${header ? header + '\n\n' : ''}${content}${footer ? '\n\n' + footer : ''}`.trim();
                                              })()
                                            )}
                                          </Markdown>
                                        </div>
                                        <button 
                                          onClick={() => setIsWhatsAppExpanded(!isWhatsAppExpanded)}
                                          className="mt-2 text-[#34B7F1] font-bold text-xs hover:underline flex items-center space-x-1"
                                        >
                                          <span>{isWhatsAppExpanded ? 'Read Less' : 'Read More...'}</span>
                                        </button>
                                      </div>
                                    </>
                                  )}
                                  <div className="flex justify-end items-center space-x-1 mt-1">
                                    <span className="text-[9px] text-gray-400">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    <div className="flex">
                                      <Check size={10} className="text-[#34B7F1]" />
                                      <Check size={10} className="text-[#34B7F1] -ml-1" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* WhatsApp Input Area */}
                            <div className="bg-[#F0F2F5] p-2 flex items-center space-x-2">
                              <div className="flex-1 bg-white rounded-full px-4 py-2 flex items-center space-x-2 shadow-sm">
                                <Smile size={20} className="text-gray-500" />
                                <div className="flex-1 text-gray-400 text-sm">Message</div>
                                <Paperclip size={20} className="text-gray-500" />
                                <Camera size={20} className="text-gray-500" />
                              </div>
                              <div className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center text-white shadow-md">
                                <Mic size={20} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="space-y-8 animate-in fade-in duration-500 origin-top transition-transform"
                          style={{ zoom: newsZoom }}
                        >
                          {isRefining ? (
                            <div className="flex flex-col items-center justify-center py-24 space-y-6 bg-white rounded-3xl border-2 border-gray-100 shadow-sm">
                              <div className="relative">
                                <Loader2 size={48} className="animate-spin text-green-600" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Sparkles size={18} className="text-green-800 animate-pulse" />
                                </div>
                              </div>
                              <div className="text-center space-y-2">
                                <h3 className="text-lg font-bold text-gray-900">Synthesizing Intelligence...</h3>
                                <p className="text-sm text-gray-500 italic">Gemini is applying market logic and cross-referencing data points.</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              {refineOptions.order === 'hi-en' ? (
                                <div className="space-y-6 bg-white p-10 rounded-[32px] shadow-sm border border-gray-100">
                                  <div className="flex items-center justify-end mb-2">
                                    <motion.button 
                                      whileTap={{ scale: 0.92 }}
                                      whileHover={{ scale: 1.02 }}
                                      onClick={() => {
                                        const { header, footer } = getHFSettings(selectedNews.category_id);
                                        const en = selectedNews.summary_en || '';
                                        const hi = selectedNews.summary_hi || '';
                                        const content = refineOptions.order === 'hi-en' 
                                          ? `${hi}${hi && en ? '\n\n' : ''}${en}`
                                          : `${en}${en && hi ? '\n\n' : ''}${hi}`;
                                        const textToCopy = `${header ? header + '\n\n' : ''}${content}${footer ? '\n\n' + footer : ''}`.trim();
                                        handleCopy('news', selectedNews.id, textToCopy);
                                      }}
                                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all relative overflow-hidden cursor-pointer select-none ${
                                        selectedNews.is_copied 
                                          ? 'bg-green-50 text-green-600 border border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30' 
                                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-155 dark:bg-[#252729] dark:text-gray-400 dark:hover:bg-[#2d3032] dark:border-gray-800 shadow-sm'
                                      }`}
                                      title={selectedNews.is_copied ? "Copied" : "Copy for WhatsApp"}
                                    >
                                      <AnimatePresence mode="wait">
                                        {justCopiedId?.startsWith(`news-${selectedNews.id}`) ? (
                                          <motion.div
                                            key="success-pop-2"
                                            initial={{ scale: 0.6, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.6, opacity: 0 }}
                                            className="flex items-center space-x-1"
                                          >
                                            <Check size={13} className="stroke-[3] text-green-650 dark:text-green-400" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-green-650 dark:text-green-400">Copied!</span>
                                          </motion.div>
                                        ) : (
                                          <motion.div
                                            key="normal-icon-2"
                                            initial={{ scale: 0.9, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.9, opacity: 0 }}
                                            className="flex items-center space-x-1"
                                          >
                                            {selectedNews.is_copied ? <Check size={13} /> : <Copy size={13} />}
                                            <span className="text-[10px] font-bold uppercase tracking-wider">{selectedNews.is_copied ? 'Copied' : 'Copy'}</span>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>

                                      {/* Wave ripple inside button on press to signify action */}
                                      <AnimatePresence>
                                        {justCopiedId?.startsWith(`news-${selectedNews.id}`) && (
                                          <motion.span 
                                            initial={{ opacity: 0.6, scale: 0 }}
                                            animate={{ opacity: 0, scale: 2.2 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.4, ease: "easeOut" }}
                                            className="absolute inset-0 bg-green-500 rounded-full pointer-events-none animate-none"
                                          />
                                        )}
                                      </AnimatePresence>
                                    </motion.button>
                                  </div>
                                  <div className="space-y-6">
                                    {(() => {
                                      const { header, footer } = getHFSettings(selectedNews.category_id);
                                      return (
                                        <>
                                          {header && (
                                            <div className="prose prose-sm max-w-none pb-4 border-b border-gray-50 italic text-gray-500 text-sm">
                                              <Markdown>{formatForMarkdownPreview(header)}</Markdown>
                                            </div>
                                          )}
                                          
                                          <div className="prose prose-sm max-w-none">
                                            {selectedNews.summary_hi ? (
                                              <div className="text-gray-900 font-sans text-[15px] leading-relaxed">
                                                <Markdown>{formatForMarkdownPreview(selectedNews.summary_hi)}</Markdown>
                                              </div>
                                            ) : (
                                              <p className="text-gray-500 italic font-sans text-[15px] leading-relaxed">प्रसंस्करण के बाद यहां अनुवाद दिखाई देगा...</p>
                                            )}
                                          </div>
                                          <div className="prose prose-sm max-w-none">
                                            <div className="text-gray-900 font-sans text-[15px] leading-relaxed">
                                              <Markdown>{formatForMarkdownPreview(selectedNews.summary_en)}</Markdown>
                                            </div>
                                          </div>

                                          {footer && (
                                            <div className="prose prose-sm max-w-none pt-4 border-t border-gray-50 italic text-gray-500 text-sm">
                                              <Markdown>{formatForMarkdownPreview(footer)}</Markdown>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-6 bg-white p-10 rounded-[32px] shadow-sm border border-gray-100">
                                  <div className="flex items-center justify-end mb-2">
                                    <motion.button 
                                      whileTap={{ scale: 0.92 }}
                                      whileHover={{ scale: 1.02 }}
                                      onClick={() => {
                                        const { header, footer } = getHFSettings(selectedNews.category_id);
                                        const en = selectedNews.summary_en || '';
                                        const hi = selectedNews.summary_hi || '';
                                        const content = refineOptions.order === 'hi-en' 
                                          ? `${hi}${hi && en ? '\n\n' : ''}${en}`
                                          : `${en}${en && hi ? '\n\n' : ''}${hi}`;
                                        const textToCopy = `${header ? header + '\n\n' : ''}${content}${footer ? '\n\n' + footer : ''}`.trim();
                                        handleCopy('news', selectedNews.id, textToCopy);
                                      }}
                                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all relative overflow-hidden cursor-pointer select-none ${
                                        selectedNews.is_copied 
                                          ? 'bg-green-50 text-green-600 border border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30' 
                                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-155 dark:bg-[#252729] dark:text-gray-400 dark:hover:bg-[#2d3032] dark:border-gray-800 shadow-sm'
                                      }`}
                                      title={selectedNews.is_copied ? "Copied" : "Copy for WhatsApp"}
                                    >
                                      <AnimatePresence mode="wait">
                                        {justCopiedId?.startsWith(`news-${selectedNews.id}`) ? (
                                          <motion.div
                                            key="success-pop-3"
                                            initial={{ scale: 0.6, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.6, opacity: 0 }}
                                            className="flex items-center space-x-1"
                                          >
                                            <Check size={13} className="stroke-[3] text-green-650 dark:text-green-400" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-green-650 dark:text-green-400">Copied!</span>
                                          </motion.div>
                                        ) : (
                                          <motion.div
                                            key="normal-icon-3"
                                            initial={{ scale: 0.9, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.9, opacity: 0 }}
                                            className="flex items-center space-x-1"
                                          >
                                            {selectedNews.is_copied ? <Check size={13} /> : <Copy size={13} />}
                                            <span className="text-[10px] font-bold uppercase tracking-wider">{selectedNews.is_copied ? 'Copied' : 'Copy'}</span>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>

                                      {/* Wave ripple inside button on press to signify action */}
                                      <AnimatePresence>
                                        {justCopiedId?.startsWith(`news-${selectedNews.id}`) && (
                                          <motion.span 
                                            initial={{ opacity: 0.6, scale: 0 }}
                                            animate={{ opacity: 0, scale: 2.2 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.4, ease: "easeOut" }}
                                            className="absolute inset-0 bg-green-500 rounded-full pointer-events-none animate-none"
                                          />
                                        )}
                                      </AnimatePresence>
                                    </motion.button>
                                  </div>
                                  <div className="space-y-6">
                                    {(() => {
                                      const { header, footer } = getHFSettings(selectedNews.category_id);
                                      return (
                                        <>
                                          {header && (
                                            <div className="prose prose-sm max-w-none pb-4 border-b border-gray-50 italic text-gray-500 text-sm">
                                              <Markdown>{formatForMarkdownPreview(header)}</Markdown>
                                            </div>
                                          )}

                                          <div className="prose prose-sm max-w-none">
                                            <div className="text-gray-900 font-sans text-[15px] leading-relaxed">
                                              <Markdown>{formatForMarkdownPreview(selectedNews.summary_en)}</Markdown>
                                            </div>
                                          </div>
                                          <div className="prose prose-sm max-w-none">
                                            {selectedNews.summary_hi ? (
                                              <div className="text-gray-900 font-sans text-[15px] leading-relaxed">
                                                <Markdown>{formatForMarkdownPreview(selectedNews.summary_hi)}</Markdown>
                                              </div>
                                            ) : (
                                              <p className="text-gray-500 italic font-sans text-[15px] leading-relaxed">प्रसंस्करण के बाद यहां अनुवाद दिखाई देगा...</p>
                                            )}
                                          </div>

                                          {footer && (
                                            <div className="prose prose-sm max-w-none pt-4 border-t border-gray-50 italic text-gray-500 text-sm">
                                              <Markdown>{formatForMarkdownPreview(footer)}</Markdown>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="py-12 text-center space-y-4">
                        <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-green-800">
                          <Sparkles size={32} />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-lg font-bold text-gray-900">Ready for Refinement</h3>
                          <p className="text-sm text-gray-500 max-w-xs mx-auto">Configure your instructions above and click Refine to generate intelligence.</p>
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                </div>
            ) : selectedReport ? (
              <div className="max-w-2xl mx-auto p-8">
                <div className="bg-white p-10 rounded-[32px] shadow-sm border border-gray-100 flex flex-col space-y-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-400 font-mono font-bold uppercase tracking-widest">{selectedReport.type} Market Report</span>
                      <span className="text-[10px] text-gray-400 font-mono">Generated: {new Date(selectedReport.created_at).toLocaleDateString()}</span>
                    </div>
                     <motion.button 
                      whileTap={{ scale: 0.92 }}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => {
                        const { header, footer } = getHFSettings(selectedReport.category_id);
                        const en = selectedReport.content_en || '';
                        const hi = selectedReport.content_hi || '';
                        const content = `${en}\n\n${hi}`;
                        const textToCopy = `${header ? header + '\n\n' : ''}${content}${footer ? '\n\n' + footer : ''}`.trim();
                        handleCopy('report', selectedReport.id, textToCopy);
                      }}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all relative overflow-hidden cursor-pointer select-none ${
                        selectedReport.is_copied 
                          ? 'bg-green-50 text-green-600 border border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30' 
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-155 dark:bg-[#252729] dark:text-gray-400 dark:hover:bg-[#2d3032] dark:border-gray-800 shadow-sm'
                      }`}
                      title={selectedReport.is_copied ? "Copied" : "Copy Report"}
                    >
                      <AnimatePresence mode="wait">
                        {justCopiedId?.startsWith(`report-${selectedReport.id}`) ? (
                          <motion.div
                            key="success-pop-4"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            className="flex items-center space-x-1"
                          >
                            <Check size={13} className="stroke-[3] text-green-650 dark:text-green-400" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-green-650 dark:text-green-400">Copied!</span>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="normal-icon-4"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="flex items-center space-x-1"
                          >
                            {selectedReport.is_copied ? <Check size={13} /> : <Copy size={13} />}
                            <span className="text-[10px] font-bold uppercase tracking-wider">{selectedReport.is_copied ? 'Copied' : 'Copy'}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Wave ripple inside button on press to signify action */}
                      <AnimatePresence>
                        {justCopiedId?.startsWith(`report-${selectedReport.id}`) && (
                          <motion.span 
                            initial={{ opacity: 0.6, scale: 0 }}
                            animate={{ opacity: 0, scale: 2.2 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="absolute inset-0 bg-green-500 rounded-full pointer-events-none animate-none"
                          />
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                  <div className="space-y-8">
                    {(() => {
                      const { header, footer } = getHFSettings(selectedReport.category_id);
                      return (
                        <>
                          {header && (
                            <div className="prose prose-sm max-w-none pb-4 border-b border-gray-50 italic text-gray-500 text-sm">
                              <Markdown>{formatForMarkdownPreview(header)}</Markdown>
                            </div>
                          )}
                          
                          <div className="prose prose-sm max-w-none">
                            <div className="text-gray-900 font-sans text-[15px] leading-relaxed">
                              <Markdown>{formatForMarkdownPreview(selectedReport.content_en)}</Markdown>
                            </div>
                          </div>
                          
                          <div className="prose prose-sm max-w-none">
                            <div className="text-gray-900 font-sans text-[15px] leading-relaxed">
                              <Markdown>{formatForMarkdownPreview(selectedReport.content_hi)}</Markdown>
                            </div>
                          </div>

                          {footer && (
                            <div className="prose prose-sm max-w-none pt-4 border-t border-gray-50 italic text-gray-500 text-sm">
                              <Markdown>{formatForMarkdownPreview(footer)}</Markdown>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                <div className="h-20 w-20 rounded-full bg-gray-300 flex items-center justify-center shadow-inner">
                  <FileText size={40} className="text-gray-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    No News Selected
                  </h3>
                  <p className="text-base text-gray-700 font-medium max-w-xs mx-auto">
                    Select an item from the history feed to view its analysis.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex h-[85vh]">
            
            {/* Settings Sidebar */}
            <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-black text-gray-900 tracking-tight">Settings</h2>
              </div>
              <div className="p-4 space-y-1 flex-1 overflow-y-auto">
                <button 
                  onClick={() => setActiveSettingsTab('general')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${activeSettingsTab === 'general' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                >
                  <Settings size={18} />
                  <span>General</span>
                </button>
                <button 
                  onClick={() => setActiveSettingsTab('api_keys')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${activeSettingsTab === 'api_keys' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                >
                  <Key size={18} />
                  <span>API Keys</span>
                </button>
                <button 
                  onClick={() => setActiveSettingsTab('data')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${activeSettingsTab === 'data' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                >
                  <Database size={18} />
                  <span>Data & Backups</span>
                </button>
              </div>
            </div>

            {/* Settings Content */}
            <div className="flex-1 flex flex-col bg-white relative">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors z-10"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>

              {activeSettingsTab === 'general' && (
                <div className="p-8 overflow-y-auto flex-1">
                  <div className="mb-8">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">General Settings</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Manage your application preferences.</p>
                  </div>
                  <div className="bg-gray-50 p-8 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500 font-medium">
                    General settings (like default language or theme) will go here in the future.
                  </div>
                </div>
              )}

              {activeSettingsTab === 'api_keys' && (
                <div className="flex flex-col h-full">
                  <div className="px-8 py-8 border-b border-gray-100 bg-white">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">API Key Management</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Configure multiple Gemini AI keys for rotation and extended free tier usage.</p>
                  </div>
                  <div className="p-8 overflow-y-auto flex-1 bg-gray-50/50">
                    {/* Add New Key Section */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center">
                        <PlusCircle size={16} className="mr-2 text-green-600" />
                        Add New API Key
                      </h3>
                      <div className="flex space-x-4">
                        <div className="flex-1 space-y-2">
                          <input 
                            type="text" 
                            placeholder="Account Name (e.g., Personal Gmail)" 
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 text-sm font-medium"
                          />
                        </div>
                        <div className="flex-[2] space-y-2">
                          <input 
                            type="password" 
                            placeholder="Paste Gemini API Key (AIzaSy...)" 
                            value={newKeyValue}
                            onChange={(e) => setNewKeyValue(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 text-sm font-mono"
                          />
                        </div>
                        <button 
                          onClick={async () => {
                            if (!newKeyName || !newKeyValue) return;
                            setIsAddingKey(true);
                            try {
                              const testAi = new GoogleGenAI({ apiKey: newKeyValue });
                              await testAi.models.generateContent({ model: "gemini-2.5-flash", contents: "test" });
                              
                              const res = await fetch('/api/keys', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: newKeyName, api_key: newKeyValue })
                              });
                              if (!res.ok) {
                                const err = await res.json();
                                alert(err.error || 'Failed to add key');
                              } else {
                                setNewKeyName('');
                                setNewKeyValue('');
                                fetchApiKeys();
                              }
                            } catch (e: any) {
                              alert('Invalid API Key. Google rejected it: ' + e.message);
                            } finally {
                              setIsAddingKey(false);
                            }
                          }}
                          disabled={isAddingKey || !newKeyName || !newKeyValue}
                          className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center"
                        >
                          {isAddingKey ? <Loader2 size={18} className="animate-spin" /> : 'Save Key'}
                        </button>
                      </div>
                    </div>

                    {/* Keys List */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4">Active Keys Rotation</h3>
                      {apiKeys.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 font-medium bg-white rounded-2xl border border-dashed border-gray-300">
                          No API keys added yet. The system is using the default environment key.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {apiKeys.sort((a, b) => a.sort_order - b.sort_order).map((key, index) => (
                            <div key={key.id} className={`flex items-center p-4 rounded-2xl border ${key.is_active ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                              <div className="flex flex-col space-y-1 mr-4 text-gray-400">
                                <button 
                                  onClick={async () => {
                                    if (index === 0) return;
                                    const newKeys = [...apiKeys];
                                    const temp = newKeys[index - 1];
                                    newKeys[index - 1] = newKeys[index];
                                    newKeys[index] = temp;
                                    await fetch('/api/keys/reorder', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ orderedIds: newKeys.map(k => k.id) })
                                    });
                                    fetchApiKeys();
                                  }}
                                  className="hover:text-gray-900 disabled:opacity-30" disabled={index === 0}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                                </button>
                                <button 
                                  onClick={async () => {
                                    if (index === apiKeys.length - 1) return;
                                    const newKeys = [...apiKeys];
                                    const temp = newKeys[index + 1];
                                    newKeys[index + 1] = newKeys[index];
                                    newKeys[index] = temp;
                                    await fetch('/api/keys/reorder', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ orderedIds: newKeys.map(k => k.id) })
                                    });
                                    fetchApiKeys();
                                  }}
                                  className="hover:text-gray-900 disabled:opacity-30" disabled={index === apiKeys.length - 1}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>
                              </div>
                              
                              <div className="flex-1 flex items-center space-x-4">
                                <div className="relative flex items-center justify-center">
                                  {key.status === 'available' && <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" title="Available"></div>}
                                  {key.status === 'exhausted' && <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" title="Exhausted (Resets at midnight)"></div>}
                                  {key.status === 'invalid' && <div className="w-3 h-3 rounded-full bg-gray-400" title="Invalid Key"></div>}
                                </div>
                                
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-gray-900">{key.name}</span>
                                    <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                      {key.api_key.substring(0, 8)}••••••••{key.api_key.substring(key.api_key.length - 4)}
                                    </span>
                                  </div>
                                  <div className="flex items-center space-x-4 mt-1">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                      {key.usage_count} Requests Today
                                    </span>
                                    {key.last_used_at && (
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                        Last used: {new Date(key.last_used_at).toLocaleTimeString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center space-x-4 ml-4">
                                <button 
                                  onClick={async () => {
                                    await fetch(`/api/keys/${key.id}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ is_active: key.is_active ? 0 : 1 })
                                    });
                                    fetchApiKeys();
                                  }}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${key.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                                >
                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${key.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                
                                <button 
                                  onClick={async () => {
                                    if (confirm('Are you sure you want to delete this key?')) {
                                      await fetch(`/api/keys/${key.id}`, { method: 'DELETE' });
                                      fetchApiKeys();
                                    }
                                  }}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'data' && (
                <div className="p-8 overflow-y-auto flex-1">
                  <div className="mb-8">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Data & Backups</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Manage your local SQLite database.</p>
                  </div>
                  <div className="bg-gray-50 p-8 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500 font-medium">
                    Database export and backup options will go here in the future.
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
      
      {/* Prompt Editor Modal */}
      {editingPrompt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <Settings2 size={20} className="text-[#009f75]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Edit Prompt Instruction</h2>
                  <p className="text-xs text-gray-500 font-medium">Fine-tune the AI for '{editingPrompt.label}'</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Instruction Text</label>
                <textarea
                  value={editingPrompt.instruction}
                  onChange={(e) => setEditingPrompt({...editingPrompt, instruction: e.target.value})}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl p-4 text-sm font-mono text-gray-800 h-48 focus:outline-none focus:border-green-500 focus:bg-white transition-all resize-none shadow-inner"
                  placeholder="Enter the exact instruction you want to send to the Gemini AI..."
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
              <button 
                onClick={() => setEditingPrompt(null)}
                className="px-6 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if(!editingPrompt.instruction.trim()) return;
                  try {
                    await fetch(`/api/prompts/${editingPrompt.key}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ instruction: editingPrompt.instruction })
                    });
                    await fetchPrompts();
                    setEditingPrompt(null);
                  } catch (e) {
                    console.error('Failed to update prompt', e);
                  }
                }}
                className="px-6 py-2.5 rounded-xl font-bold bg-[#009f75] hover:bg-[#008f69] text-white shadow-md transition-all text-sm flex items-center"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit News Modal */}
      {isEditingNews && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 ${
            theme === 'dark' ? 'bg-[#1e2023] border border-[#2d2f31]' : 'bg-white'
          }`}>
            <div className="p-8 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-green-100 text-[#009f75]">
                  <Pencil size={20} />
                </div>
                <div>
                  <h3 className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Edit News Content</h3>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">ID: #{isEditingNews.id} • {isEditingNews.type} News</p>
                </div>
              </div>
              <button 
                onClick={() => setIsEditingNews(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
              >
                <Plus className="rotate-45" size={24} />
              </button>
            </div>
            
            <div className="p-8 pb-0">
              <div className="flex items-center justify-between mb-4">
                <label className={`text-xs font-black uppercase tracking-widest ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Raw Intelligence / Images
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    id="edit-news-image-upload"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                  />
                  <button
                    onClick={() => document.getElementById('edit-news-image-upload')?.click()}
                    disabled={isProcessingImage}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${
                      theme === 'dark' 
                        ? 'bg-white/5 text-gray-300 hover:bg-white/10' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    {isProcessingImage ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                    <span>{editingNewsImages.length > 0 ? `Add Images (${editingNewsImages.length})` : 'Add Images'}</span>
                  </button>
                  <div className={`h-4 w-[1px] ${theme === 'dark' ? 'bg-[#2d2f31]' : 'bg-gray-200'}`} />
                  <span className="text-[10px] text-gray-400 font-bold italic">Paste images directly</span>
                </div>
              </div>
              <textarea
                value={editingNewsContent}
                onChange={(e) => setEditingNewsContent(e.target.value)}
                onPaste={handleImagePaste}
                className={`w-full h-64 p-6 rounded-2xl border-2 font-medium text-base resize-none focus:outline-none focus:ring-4 focus:ring-[#009f75]/10 custom-scrollbar transition-all ${
                  theme === 'dark' 
                    ? 'bg-[#151719] border-[#2d2f31] text-gray-200 focus:border-[#009f75]' 
                    : 'bg-gray-50 border-gray-100 text-gray-800 focus:border-[#009f75] focus:bg-white'
                }`}
                placeholder="Paste or type more content here..."
              />
              
              {editingNewsImages.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 rounded-xl bg-black/5">
                  {editingNewsImages.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-300 group shadow-sm bg-white">
                      <img src={img} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setEditingNewsImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                  {isProcessingImage && (
                    <div className="w-20 h-20 rounded-lg border border-dashed border-gray-300 flex items-center justify-center animate-pulse bg-white/10">
                      <Loader2 size={20} className="animate-spin text-gray-400" />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className={`p-8 border-t flex justify-end space-x-4 ${theme === 'dark' ? 'border-[#2d2f31] bg-[#1a1c1e]' : 'border-gray-100 bg-gray-50'}`}>
              <button 
                onClick={() => setIsEditingNews(null)}
                className={`px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${
                  theme === 'dark' ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-200'
                }`}
              >
                Discard
              </button>
              <button 
                onClick={saveEditedNews}
                className="px-10 py-4 rounded-2xl font-black bg-[#009f75] hover:bg-[#008f65] text-white shadow-xl shadow-[#009f75]/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm uppercase tracking-widest flex items-center"
              >
                Update News
              </button>
            </div>
          </div>
        </div>
      )}
      {isHeaderFooterModalOpen && hfEditingCategory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`w-full max-w-md rounded-[24px] shadow-2xl overflow-hidden ${
              theme === 'dark' ? 'bg-[#1e2023] border border-[#2d2f31]' : 'bg-white'
            }`}
          >
            <div className={`p-6 border-b flex items-center justify-between ${theme === 'dark' ? 'bg-[#1e2023] border-[#2d2f31]' : 'bg-[#f8f9fa] border-gray-100'}`}>
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-[#009f75] text-white">
                  <PanelTop size={18} />
                </div>
                <div>
                  <h3 className={`text-base font-black ${theme === 'dark' ? 'text-white' : 'text-gray-900 uppercase'}`}>Header & Footer</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{hfEditingCategory.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsHeaderFooterModalOpen(false)}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-400"
              >
                <Plus className="rotate-45" size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-widest text-[#6c7d8f]">Header Text</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={isHfHeaderActive}
                      onChange={(e) => setIsHfHeaderActive(e.target.checked)}
                    />
                    <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#009f75]"></div>
                    <span className="ml-2 text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{isHfHeaderActive ? 'Active' : 'Inactive'}</span>
                  </label>
                </div>
                
                <RichEditor
                  value={hfHeader}
                  onChange={setHfHeader}
                  placeholder="Enter header text..."
                  theme={theme}
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-0.5">
                  <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">Insert Stamp:</span>
                  <button
                    type="button"
                    onClick={() => insertHFTag('header', '{{DATE}}')}
                    className="px-2 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                    title="Inserts dynamic date placeholder {{DATE}} (updated automatically everyday)"
                  >
                    {"{{DATE}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertHFTag('header', '{{TIME}}')}
                    className="px-2 py-0.5 rounded text-[8px] font-bold bg-[#009f75]/10 text-[#009f75] dark:bg-[#009f75]/20 dark:text-[#00df95] border border-[#009f75]/25 hover:bg-[#009f75]/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                    title="Inserts dynamic time placeholder {{TIME}} (updated automatically in real-time)"
                  >
                    {"{{TIME}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertHFTag('header', '{{DATETIME}}')}
                    className="px-2 py-0.5 rounded text-[8px] font-bold bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                    title="Inserts dynamic date and time placeholder {{DATETIME}}"
                  >
                    {"{{DATETIME}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertHFTag('header', getStaticTimestamp())}
                    className="px-2 py-0.5 rounded text-[8px] font-mono font-bold bg-gray-100 text-gray-650 dark:bg-[#2d2f31] dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-200/50 cursor-pointer select-none transition-all flex items-center space-x-1"
                    title="Inserts a fixed, un-changing current timestamp"
                  >
                    <span>⚡ Static</span>
                  </button>
                </div>
                {(hfHeader.includes('{{DATE}}') || hfHeader.includes('{{TIME}}') || hfHeader.includes('{{DATETIME}}') || hfHeader.includes('{{TIMESTAMP}}')) && (
                  <div className="mt-2 px-3 py-1.5 text-[10px] bg-amber-500/[0.04] text-amber-800 dark:bg-amber-500/[0.08] dark:text-amber-400 border border-amber-500/10 rounded-lg italic">
                    <strong className="not-italic font-black text-[9px] uppercase tracking-wider text-amber-600 mr-2">Preview with Values:</strong>
                    "{formatHFText(hfHeader)}"
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-widest text-[#6c7d8f]">Footer Text</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={isHfFooterActive}
                      onChange={(e) => setIsHfFooterActive(e.target.checked)}
                    />
                    <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#009f75]"></div>
                    <span className="ml-2 text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{isHfFooterActive ? 'Active' : 'Inactive'}</span>
                  </label>
                </div>
                
                <RichEditor
                  value={hfFooter}
                  onChange={setHfFooter}
                  placeholder="Enter footer text..."
                  theme={theme}
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-0.5">
                  <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">Insert Stamp:</span>
                  <button
                    type="button"
                    onClick={() => insertHFTag('footer', '{{DATE}}')}
                    className="px-2 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                    title="Inserts dynamic date placeholder {{DATE}} (updated automatically everyday)"
                  >
                    {"{{DATE}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertHFTag('footer', '{{TIME}}')}
                    className="px-2 py-0.5 rounded text-[8px] font-bold bg-[#009f75]/10 text-[#009f75] dark:bg-[#009f75]/20 dark:text-[#00df95] border border-[#009f75]/25 hover:bg-[#009f75]/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                    title="Inserts dynamic time placeholder {{TIME}} (updated automatically in real-time)"
                  >
                    {"{{TIME}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertHFTag('footer', '{{DATETIME}}')}
                    className="px-2 py-0.5 rounded text-[8px] font-bold bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                    title="Inserts dynamic date and time placeholder {{DATETIME}}"
                  >
                    {"{{DATETIME}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertHFTag('footer', getStaticTimestamp())}
                    className="px-2 py-0.5 rounded text-[8px] font-mono font-bold bg-gray-100 text-gray-650 dark:bg-[#2d2f31] dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-200/50 cursor-pointer select-none transition-all flex items-center space-x-1"
                    title="Inserts a fixed, un-changing current timestamp"
                  >
                    <span>⚡ Static</span>
                  </button>
                </div>
                {(hfFooter.includes('{{DATE}}') || hfFooter.includes('{{TIME}}') || hfFooter.includes('{{DATETIME}}') || hfFooter.includes('{{TIMESTAMP}}')) && (
                  <div className="mt-2 px-3 py-1.5 text-[10px] bg-amber-500/[0.04] text-amber-800 dark:bg-amber-500/[0.08] dark:text-amber-400 border border-amber-500/10 rounded-lg italic">
                    <strong className="not-italic font-black text-[9px] uppercase tracking-wider text-amber-600 mr-2">Preview with Values:</strong>
                    "{formatHFText(hfFooter)}"
                  </div>
                )}
              </div>
            </div>

            <div className={`p-6 border-t flex items-center justify-end space-x-3 ${theme === 'dark' ? 'bg-[#1e2023] border-[#2d2f31]' : 'bg-[#f8f9fa] border-gray-100'}`}>
              <button
                onClick={() => setIsHeaderFooterModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveHeaderFooter}
                className="px-6 py-2 bg-[#009f75] text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-[#008f65] shadow-lg shadow-[#009f75]/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
    </>
  );
}
