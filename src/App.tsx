/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Copy,
  Maximize2,
  Pickaxe,
  Droplets,
  Sprout,
  Eye,
  EyeOff,
  Settings,
  History,
  FileText,
  Send,
  Loader2,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  RotateCcw,
  Trash,
  PlusCircle,
  Check,
  Star,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  Database,
  MessageSquare,
  ArrowLeft,
  Video,
  Phone,
  MoreVertical,
  Smile,
  Paperclip,
  Camera,
  Mic,
  Key,
  Settings2,
  ZoomIn,
  ZoomOut,
  Layout,
  PanelLeftClose,
  PanelRightClose,
  Sun,
  Moon,
  Palette,
  Volume2,
  User,
  Search,
  Archive,
  Pencil,
  Image as ImageIcon,
  FileUp,
  Globe,
  Type as TypeIcon,
  List,
  AlignLeft,
  Ruler,
  Scissors,
  Zap,
  Hash,
  Tags,
  Target,
  Activity,
  Gauge,
  Heading,
  Monitor,
  Smartphone,
  PanelTop,
  PanelBottom,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Cpu,
  ArrowUpDown,
  BarChart2,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import Markdown from "react-markdown";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import * as XLSX from "xlsx";

const Type = {
  OBJECT: "OBJECT" as const,
  STRING: "STRING" as const,
  INTEGER: "INTEGER" as const,
  NUMBER: "NUMBER" as const,
  BOOLEAN: "BOOLEAN" as const,
  ARRAY: "ARRAY" as const,
};

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
  status: "available" | "exhausted" | "invalid";
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
  type: "raw" | "refined";
  parent_id: number | null;
  raw_text: string;
  summary_en: string | null;
  summary_hi: string | null;
  is_copied?: number;
  created_at: string;
  images?: string[];
  criteria_id?: number | null;
  refine_options?: string;
  correction_history?: string;
}

interface CriteriaItem {
  id: number;
  name: string;
  created_at?: string;
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

const getRefinedImageDetails = (text: string | null | undefined) => {
  if (!text) return null;
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/;
  const match = text.match(regex);
  if (match) {
    const alt = match[1];
    const url = match[2];
    const caption = text.replace(regex, "").trim();
    return { url, alt, caption };
  }
  return null;
};

const repairMarkdownHF = (text: string | null | undefined): string => {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => {
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
      triplet = repairTag(triplet, "**");
      triplet = repairTag(triplet, "_");
      triplet = repairTag(triplet, "~~");
      triplet = repairTag(triplet, "`");
      return triplet;
    })
    .join("\n");
};

const mdToHtml = (md: string): string => {
  if (!md) return "";
  // Before converting, let's repair any broken line-by-line formatting
  const repaired = repairMarkdownHF(md);

  return repaired
    .split("\n")
    .map((line) => {
      let html = line;
      // Escape HTML characters first to avoid injecting tags
      html = html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // Formatters (line-by-line)
      html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/_(.*?)_/g, "<em>$1</em>");
      html = html.replace(/~~(.*?)~~/g, "<del>$1</del>");
      html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");

      return html;
    })
    .join("<br>");
};

const htmlToMd = (html: string): string => {
  if (!html) return "";

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  const traverse = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const el = node as HTMLElement;
    let childrenText = "";
    el.childNodes.forEach((child) => {
      childrenText += traverse(child);
    });

    const tag = el.tagName.toLowerCase();
    const style = el.getAttribute("style") || "";

    const isBold =
      tag === "strong" ||
      tag === "b" ||
      style.includes("font-weight: bold") ||
      el.style.fontWeight === "bold";
    const isItalic =
      tag === "em" ||
      tag === "i" ||
      style.includes("font-style: italic") ||
      el.style.fontStyle === "italic";
    const isStrike =
      tag === "del" ||
      tag === "s" ||
      tag === "strike" ||
      style.includes("text-decoration: line-through") ||
      el.style.textDecoration === "line-through" ||
      el.style.textDecorationLine === "line-through";
    const isCode =
      tag === "code" ||
      tag === "pre" ||
      style.includes("font-family: monospace") ||
      el.style.fontFamily === "monospace" ||
      (tag === "font" && el.getAttribute("face") === "monospace");

    if (tag === "br") {
      return "\n";
    }
    if (tag === "div" || tag === "p") {
      return childrenText ? "\n" + childrenText : "";
    }

    let wrapped = childrenText;
    if (isBold && wrapped.trim()) {
      wrapped = wrapped
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          const match = line.match(/^(\s*)(.*?)(\s*)$/);
          if (match) {
            const [_, lead, content, trail] = match;
            if (
              content &&
              !content.startsWith("**") &&
              !content.endsWith("**")
            ) {
              return `${lead}**${content}**${trail}`;
            }
          }
          return line;
        })
        .join("\n");
    }
    if (isItalic && wrapped.trim()) {
      wrapped = wrapped
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          const match = line.match(/^(\s*)(.*?)(\s*)$/);
          if (match) {
            const [_, lead, content, trail] = match;
            if (content && !content.startsWith("_") && !content.endsWith("_")) {
              return `${lead}_${content}_${trail}`;
            }
          }
          return line;
        })
        .join("\n");
    }
    if (isStrike && wrapped.trim()) {
      wrapped = wrapped
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          const match = line.match(/^(\s*)(.*?)(\s*)$/);
          if (match) {
            const [_, lead, content, trail] = match;
            if (
              content &&
              !content.startsWith("~~") &&
              !content.endsWith("~~")
            ) {
              return `${lead}~~${content}~~${trail}`;
            }
          }
          return line;
        })
        .join("\n");
    }
    if (isCode && wrapped.trim()) {
      wrapped = wrapped
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          const match = line.match(/^(\s*)(.*?)(\s*)$/);
          if (match) {
            const [_, lead, content, trail] = match;
            if (content && !content.startsWith("`") && !content.endsWith("`")) {
              return `${lead}\`${content}\`${trail}`;
            }
          }
          return line;
        })
        .join("\n");
    }

    return wrapped;
  };

  let result = "";
  tempDiv.childNodes.forEach((child) => {
    result += traverse(child);
  });

  return result.replace(/^\n+/, "").replace(/\n+$/, "").trim();
};

interface RichEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  theme?: "dark" | "light";
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>; // Kept for layout consistency
}

const RichEditor: React.FC<RichEditorProps> = ({
  value,
  onChange,
  placeholder = "",
  theme = "light",
}) => {
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
        <span className="text-[10px] font-black uppercase text-gray-450 dark:text-gray-500 tracking-wider px-2 border-r border-[#e2e8f0]/40 dark:border-gray-800 mr-1 select-none">
          Format:
        </span>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleFormat("bold");
          }}
          className="p-1 rounded text-gray-650 hover:text-black hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 w-6 h-6 flex items-center justify-center transition-all cursor-pointer"
          title="Bold (B)"
        >
          <Bold size={11} strokeWidth={3} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleFormat("italic");
          }}
          className="p-1 rounded text-gray-650 hover:text-black hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 w-6 h-6 flex items-center justify-center transition-all cursor-pointer"
          title="Italic (I)"
        >
          <Italic size={11} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleFormat("strikeThrough");
          }}
          className="p-1 rounded text-gray-650 hover:text-black hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 w-6 h-6 flex items-center justify-center transition-all cursor-pointer"
          title="Strikethrough (S)"
        >
          <Strikethrough size={11} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleFormat("fontName", "monospace");
          }}
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
          theme === "dark"
            ? "bg-[#151719] border-[#2d2f31] text-gray-200 focus:border-[#009f75]"
            : "bg-white border-[#dce0e5] text-gray-800 focus:border-[#009f75]"
        }`}
        style={{ whiteSpace: "pre-wrap" }}
        data-placeholder={placeholder}
      />
    </div>
  );
};

const timeFilterDisplayNames: Record<string, string> = {
  today: "TODAY",
  yesterday: "YESTERDAY",
  "1week": "1 WEEK",
  "2week": "2 WEEK",
  "1month": "1 MONTH",
  "3month": "3 MONTH",
  custom: "CUSTOM",
  stared: "STARED",
};

export default function App() {
  const [viewMode, setViewMode] = useState<
    "intelligence" | "reports" | "trash"
  >("intelligence");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<
    Record<string, PromptTemplate>
  >({});
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(
    null,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPos, setSettingsPos] = useState({ x: 100, y: 60 });
  const [settingsSize, setSettingsSize] = useState({ width: 1000, height: 600 });
  const [isDraggingSettings, setIsDraggingSettings] = useState(false);
  const [activeResizeSettingsDir, setActiveResizeSettingsDir] = useState<string | null>(null);

  const settingsDragStartOffset = useRef({ x: 0, y: 0 });
  const settingsResizeStartRect = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const settingsResizeStartPos = useRef({ x: 0, y: 0 });

  const handleSettingsDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, textarea, select, label, option, [role='button']"))
      return;
    setIsDraggingSettings(true);
    settingsDragStartOffset.current = {
      x: e.clientX - settingsPos.x,
      y: e.clientY - settingsPos.y,
    };
    e.preventDefault();
  };

  const handleSettingsResizeStart = (e: React.MouseEvent<HTMLDivElement>, direction: string) => {
    if (e.button !== 0) return;
    setActiveResizeSettingsDir(direction);
    settingsResizeStartRect.current = {
      x: settingsPos.x,
      y: settingsPos.y,
      width: settingsSize.width,
      height: settingsSize.height,
    };
    settingsResizeStartPos.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    e.stopPropagation();
  };

  // Auto-center Settings popup when opened & respond to resize constraints
  useEffect(() => {
    if (isSettingsOpen) {
      const width = Math.min(1024, window.innerWidth - 40);
      const height = Math.min(640, window.innerHeight - 40);
      setSettingsSize({ width, height });
      setSettingsPos({
        x: Math.max(20, (window.innerWidth - width) / 2),
        y: Math.max(20, (window.innerHeight - height) / 2),
      });
    }
  }, [isSettingsOpen]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "general" | "api_keys" | "data" | "criteria" | "reporting"
  >("api_keys");
  const [reportingPeriod, setReportingPeriod] = useState<string>("1day");
  const [reportingCustomFrom, setReportingCustomFrom] = useState<string>("");
  const [reportingCustomTo, setReportingCustomTo] = useState<string>("");
  const [reportingNewsType, setReportingNewsType] = useState<"all" | "raw" | "refined">("all");
  const [reportingCriteriaFilter, setReportingCriteriaFilter] = useState<number | "all" | "none">("all");
  const [reportingStarredOnly, setReportingStarredOnly] = useState<boolean>(false);
  const [reportingCounts, setReportingCounts] = useState<Record<number, number>>({});
  const [showCountsInSidebar, setShowCountsInSidebar] = useState<boolean>(() => {
    try {
      const persisted = localStorage.getItem("showCountsInSidebar");
      return persisted === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("showCountsInSidebar", String(showCountsInSidebar));
    } catch (e) {
      console.error(e);
    }
  }, [showCountsInSidebar]);

  const [expandedReportingCategories, setExpandedReportingCategories] = useState<
    Record<number, boolean>
  >({});
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<
    Record<number, boolean>
  >({});
  const [inputText, setInputText] = useState("");
  const [inputImages, setInputImages] = useState<string[]>([]);
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  const [reportsList, setReportsList] = useState<ReportItem[]>([]);
  const [trashItems, setTrashItems] = useState<{
    news: NewsItem[];
    reports: ReportItem[];
  }>({ news: [], reports: [] });
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<
    "daily" | "weekly" | "monthly"
  >("daily");
  const [reportSource, setReportSource] = useState<
    "raw" | "refined" | "master"
  >("refined");
  const [newsForReport, setNewsForReport] = useState<NewsItem[]>([]);
  const [selectedNewsIds, setSelectedNewsIds] = useState<Set<number>>(
    new Set(),
  );
  const [starredNewsIds, setStarredNewsIds] = useState<Set<number>>(new Set());
  const [isEditingNews, setIsEditingNews] = useState<NewsItem | null>(null);
  const [editingNewsContent, setEditingNewsContent] = useState("");
  const [editingNewsImages, setEditingNewsImages] = useState<string[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [expandedNewsIds, setExpandedNewsIds] = useState<Set<number>>(
    new Set(),
  );
  const [isFetchingNewsForReport, setIsFetchingNewsForReport] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refineMode, setRefineMode] = useState<"news" | "image">("news");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isLoadingTrash, setIsLoadingTrash] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [addingToParentId, setAddingToParentId] = useState<
    number | "root" | null
  >(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [isHeaderFooterModalOpen, setIsHeaderFooterModalOpen] = useState(false);
  const [hfEditingCategory, setHfEditingCategory] =
    useState<CategoryItem | null>(null);
  const [hfHeader, setHfHeader] = useState("");
  const [hfFooter, setHfFooter] = useState("");
  const [isHfHeaderActive, setIsHfHeaderActive] = useState(false);
  const [isHfFooterActive, setIsHfFooterActive] = useState(false);

  // Market Commentary / Spreadsheet Analysis States
  const [commentaryPanelTab, setCommentaryPanelTab] = useState<
    "explorer" | "analytics" | "history"
  >("explorer");
  const [commentaryFileName, setCommentaryFileName] = useState<string>(
    "LME_Standard_Sample.xlsx",
  );
  const [commentarySheets, setCommentarySheets] = useState<
    { sheetName: string; data: any[][]; selected: boolean }[]
  >(() => {
    // Standard default preloaded data representing LME structures and Price boundaries
    const sheet1Data = [
      [
        "Date",
        "Time",
        "Copper",
        "Change",
        "Aluminum",
        "Change",
        "Nickel",
        "Change",
        "Zinc",
        "Change",
        "Lead",
        "Change",
        "Tin",
        "Change",
      ],
      [
        "20-Mar-25",
        "1:41 PM",
        "240325",
        "-3850",
        "501825",
        "-325",
        "199686",
        "378",
        "161375",
        "-450",
        "201800",
        "-1450",
        "3550",
        "-170",
      ],
      [
        "19-Mar-25",
        "1:37 PM",
        "239850",
        "-1475",
        "502150",
        "-375",
        "199308",
        "450",
        "161825",
        "-850",
        "203250",
        "-1100",
        "3720",
        "-15",
      ],
      [
        "13-Mar-25",
        "1:38 PM",
        "241325",
        "1000",
        "502525",
        "525",
        "198858",
        "-828",
        "162675",
        "1300",
        "204350",
        "1100",
        "3735",
        "15",
      ],
      [
        "12-Mar-25",
        "2:35 PM",
        "240325",
        "-3850",
        "501825",
        "-325",
        "199686",
        "378",
        "161375",
        "-450",
        "201800",
        "-1450",
        "3550",
        "-170",
      ],
      [
        "11-Mar-25",
        "2:36 PM",
        "244175",
        "-9150",
        "502150",
        "-4050",
        "199308",
        "1482",
        "161825",
        "1725",
        "203250",
        "-1650",
        "3720",
        "5",
      ],
      [
        "10-Mar-25",
        "2:31 PM",
        "253325",
        "-4000",
        "506200",
        "-4700",
        "197826",
        "-696",
        "160100",
        "-75",
        "204900",
        "-1300",
        "3715",
        "20",
      ],
      [
        "7-Mar-25",
        "2:34 PM",
        "257325",
        "-1850",
        "510900",
        "-4700",
        "198522",
        "-888",
        "160175",
        "-775",
        "206200",
        "-1125",
        "3695",
        "-5",
      ],
      [
        "6-Mar-25",
        "2:41 PM",
        "259175",
        "-975",
        "515600",
        "-4275",
        "199410",
        "4890",
        "160950",
        "-375",
        "207325",
        "-1075",
        "3700",
        "-50",
      ],
      [
        "5-Mar-25",
        "2:35 PM",
        "260150",
        "-850",
        "519875",
        "-4625",
        "194520",
        "-840",
        "161325",
        "-625",
        "208400",
        "-3075",
        "3750",
        "20",
      ],
      [
        "4-Mar-25",
        "2:34 PM",
        "261000",
        "-50",
        "524500",
        "7350",
        "195360",
        "198",
        "161950",
        "-1650",
        "211475",
        "-1175",
        "3730",
        "-10",
      ],
      [
        "3-Mar-25",
        "2:35 PM",
        "261050",
        "-1025",
        "517150",
        "-4050",
        "195162",
        "198",
        "163600",
        "-825",
        "212650",
        "-2150",
        "3740",
        "15",
      ],
      [
        "28-Feb-25",
        "2:31 PM",
        "262075",
        "-1575",
        "521200",
        "-4225",
        "194964",
        "1182",
        "164425",
        "-525",
        "214800",
        "-1550",
        "3725",
        "50",
      ],
      [
        "27-Feb-25",
        "2:34 PM",
        "263650",
        "-1375",
        "525425",
        "-4050",
        "193782",
        "1674",
        "164950",
        "-425",
        "216350",
        "-1600",
        "3675",
        "-25",
      ],
      [
        "26-Feb-25",
        "2:34 PM",
        "265025",
        "-1675",
        "529475",
        "-1550",
        "192108",
        "-534",
        "165375",
        "600",
        "217950",
        "-1750",
        "3700",
        "90",
      ],
      [
        "25-Feb-25",
        "2:30 PM",
        "266700",
        "-525",
        "531025",
        "-4875",
        "192642",
        "-186",
        "164775",
        "3775",
        "219700",
        "-850",
        "3610",
        "-30",
      ],
    ];

    const sheet2Data = [
      [
        "Metal Profile",
        "Benchmark Support",
        "Benchmark Resistance",
        "Current Pivot",
        "Volatility Rating",
      ],
      ["Copper", "235,000", "265,000", "250,500", "High"],
      ["Aluminum", "495,000", "525,000", "510,000", "Medium"],
      ["Nickel", "190,000", "210,000", "198,000", "High"],
      ["Zinc", "155,000", "175,000", "163,000", "Medium-Low"],
      ["Lead", "200,000", "225,000", "212,000", "Low"],
      ["Tin", "3,500", "4,200", "3,850", "Extreme"],
    ];

    return [
      { sheetName: "LME Metal Inventory", data: sheet1Data, selected: true },
      {
        sheetName: "Benchmark price boundaries",
        data: sheet2Data,
        selected: false,
      },
    ];
  });

  const [activeCommentarySheet, setActiveCommentarySheet] = useState<string>(
    "LME Metal Inventory",
  );
  const [selectedCommentaryCommodity, setSelectedCommentaryCommodity] =
    useState<string>("All");
  const [commentaryStartDate, setCommentaryStartDate] =
    useState<string>("2025-02-25");
  const [commentaryEndDate, setCommentaryEndDate] =
    useState<string>("2025-03-20");

  // Helper to parse dates like "20-Mar-25" or "25-Feb-25"
  const parseLMEDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const monthStr = parts[1].toLowerCase();
    const yearShort = parseInt(parts[2], 10);

    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const monthIdx = months.indexOf(monthStr.slice(0, 3));
    if (monthIdx === -1) return null;

    const year = 2000 + yearShort;
    return new Date(year, monthIdx, day);
  };

  // Helper to get visible column indices based on selected commodity
  const getVisibleColumnIndices = (
    headers: any[],
    selectedCommodity: string,
  ): number[] => {
    const indices: number[] = [];
    headers.forEach((hdr, idx) => {
      const name = String(hdr).toLowerCase();
      if (name === "date" || name === "time" || idx < 2) {
        indices.push(idx);
      }
    });

    if (selectedCommodity === "All") {
      return headers.map((_, idx) => idx);
    }

    const commodityIdx = headers.findIndex(
      (hdr) => String(hdr).toLowerCase() === selectedCommodity.toLowerCase(),
    );

    if (commodityIdx !== -1) {
      indices.push(commodityIdx);
      if (
        commodityIdx + 1 < headers.length &&
        String(headers[commodityIdx + 1]).toLowerCase() === "change"
      ) {
        indices.push(commodityIdx + 1);
      }
    }

    return Array.from(new Set(indices)).sort((a, b) => a - b);
  };

  // Helper to filter rows row-wise based on date range and/or commodity name
  const getFilteredRowsForSheet = (
    sheetName: string,
    headers: any[],
    rawRows: any[][],
    selectedCommodity: string,
    startDate?: string,
    endDate?: string,
  ) => {
    let rows = [...rawRows];

    const isInventorySheet =
      sheetName.toLowerCase().includes("inventory") ||
      headers.map((h) => String(h).toLowerCase()).includes("date");
    const isBoundariesSheet =
      sheetName.toLowerCase().includes("boundaries") ||
      headers.map((h) => String(h).toLowerCase()).includes("metal profile");

    if (isInventorySheet) {
      if (startDate || endDate) {
        rows = rows.filter((row) => {
          const dateCell = row[0];
          if (!dateCell) return true;
          const parsedDate = parseLMEDate(String(dateCell));
          if (!parsedDate) return true;

          if (startDate) {
            const startLimit = new Date(startDate);
            if (parsedDate < startLimit) return false;
          }
          if (endDate) {
            const endLimit = new Date(endDate);
            if (parsedDate > endLimit) return false;
          }
          return true;
        });
      }
    } else if (isBoundariesSheet) {
      if (selectedCommodity !== "All") {
        const profileColIdx = headers.findIndex(
          (h) => String(h).toLowerCase() === "metal profile",
        );
        if (profileColIdx !== -1) {
          rows = rows.filter((row) => {
            const profileVal = String(row[profileColIdx] || "").toLowerCase();
            return profileVal === selectedCommodity.toLowerCase();
          });
        }
      }
    }

    return rows;
  };

  const [commentaryDuration, setCommentaryDuration] = useState<
    "daily" | "weekly" | "monthly" | "yearly"
  >("daily");
  const [commentaryLengthLines, setCommentaryLengthLines] =
    useState<number>(15);
  const [commentaryPromptText, setCommentaryInstruction] = useState<string>("");
  const [isAnalyzingCommentary, setIsAnalyzingCommentary] =
    useState<boolean>(false);
  const [generatedCommentary, setGeneratedCommentary] = useState<string>(() => {
    return localStorage.getItem("last_generated_commentary") || "";
  });
  const [commentaryPageNum, setCommentaryPageNum] = useState<number>(0);
  const rowsPerPage = 10;

  const [commentaryHistory, setCommentaryHistory] = useState<
    { id: string; title: string; content: string; date: string }[]
  >(() => {
    const cached = localStorage.getItem("commentary_history");
    return cached
      ? JSON.parse(cached)
      : [
          {
            id: "sample-1",
            title: "Daily LME Inventory Report (Copper Focus)",
            content:
              "# Daily Metal Inventory Analysis\n\n- **Copper**: Current inventory is 240,325 metric tons under a significant daily contraction of -3,850 metric tons, suggesting strong localized demand or immediate offtake.\n- **Aluminum**: Stockpiles hold at 501,825 mt, sliding slightly by -325 mt. Bearish trend is consolidating but showing resilience near major pivots.\n- **Tin**: Inventory registers at 3,550 mt with a daily contraction of -170 mt.\n- **Market Outlook**: Overall inventory is sliding relative to 50-day moving averages, pointing to potential squeeze patterns in refined copper and nickel categories.",
            date: "2026-06-04 10:15",
          },
        ];
  });

  const handleSpreadsheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readSpreadsheet(file);
  };

  const readSpreadsheet = (file: File) => {
    setCommentaryFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetList = workbook.SheetNames;

        const newSheets = sheetList.map((name, idx) => {
          const sheet = workbook.Sheets[name];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
          return {
            sheetName: name,
            data: rawRows,
            selected: idx === 0,
          };
        });

        if (newSheets.length > 0) {
          setCommentarySheets(newSheets);
          setActiveCommentarySheet(newSheets[0].sheetName);
          setCommentaryPageNum(0);
        }
      } catch (err) {
        console.error("Error parsing spreadsheet file: ", err);
        alert(
          "Failed to parse the file. Please ensure it is a valid Excel or CSV file.",
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleGenerateCommentary = async () => {
    setIsAnalyzingCommentary(true);
    setCommentaryPanelTab("analytics");
    try {
      const selectedSheets = commentarySheets.filter((s) => s.selected);
      const selectedSheetsContext = selectedSheets
        .map((s) => {
          const headers = s.data[0] || [];
          const rawRows = s.data.slice(1);

          // Filter columns based on selected commodity
          const visibleColIndices = getVisibleColumnIndices(
            headers,
            selectedCommentaryCommodity,
          );
          const filteredHeader = visibleColIndices.map((idx) => headers[idx]);

          // Filter rows based on date range and/or commodity name
          const filteredRawRows = getFilteredRowsForSheet(
            s.sheetName,
            headers,
            rawRows,
            selectedCommentaryCommodity,
            commentaryStartDate,
            commentaryEndDate,
          );

          // Build a CSV-like summary of the filtered table for Gemini
          const rowStrings = filteredRawRows.slice(0, 80).map((row) => {
            return visibleColIndices
              .map((idx) => (row[idx] !== undefined ? row[idx] : ""))
              .join(", ");
          });

          return `### Sheet: [${s.sheetName}] (Filtered Columns: ${filteredHeader.join(", ")})\n${filteredHeader.join(", ")}\n${rowStrings.join("\n")}`;
        })
        .join("\n\n");

      const customPrompt = `
You are an expert commodities research analyst and market intelligence specialist writing professional commentary.
Focus your analysis on the COMMODITY: [${selectedCommentaryCommodity}] and the SPECIFIED PERIOD: [${commentaryStartDate || "Any"} to ${commentaryEndDate || "Any"}].

REPORT TIMEFRAME: ${commentaryDuration}
TARGET LENGTH GUIDELINE: ~${commentaryLengthLines} lines of deep, high-value commodity-specific commentary.
USER SPECIFIC DIRECTIONS / INSTRUCTIONS:
${commentaryPromptText || "Provide a comprehensive Overview and localized trends analysis."}

DATASETS FOR ANALYSIS (Pre-filtered for ${selectedCommentaryCommodity} over the selected period):
${selectedSheetsContext || "No spreadsheet data loaded."}

INSTRUCTIONS FOR GENERATION:
1. Provide an authoritative, professional, and specific commentary on the commodity: ${selectedCommentaryCommodity} (if 'All', cover them comprehensively).
2. Clearly analyze the data for the requested period of ${commentaryStartDate} to ${commentaryEndDate}. Highlight trends, price movements, and inventory spikes.
3. Directly interpret the 'Change' columns! Negative changes represent warehouse inventory withdrawals (bullish momentum or off-take squeezes), and positive changes represent warehouse deliveries (demand cooling, buffer builds).
4. Since this is an outreach commentary, maintain a highly professional, objective, client-ready tone. Highlight support and resistance boundaries if available in the context data.
5. The report should be written in Markdown format.
`;

      const res = await callGeminiWithFallback(customPrompt);
      const textOutput = res.text || "";
      setGeneratedCommentary(textOutput);
      localStorage.setItem("last_generated_commentary", textOutput);
    } catch (err: any) {
      console.error("Failed to generate commentary: ", err);
      alert("AI generation failed: " + (err.message || String(err)));
    } finally {
      setIsAnalyzingCommentary(false);
    }
  };

  const handleSaveCommentaryToHistory = () => {
    if (!generatedCommentary) return;
    const titlePrompt = prompt(
      "Enter a title for this Report Commentary:",
      `${commentaryDuration.toUpperCase()} LME Analysis - ${new Date().toLocaleDateString()}`,
    );
    if (titlePrompt === null) return;

    const newReport = {
      id: "commentary-" + Date.now(),
      title: titlePrompt || `${commentaryDuration.toUpperCase()} LME Analysis`,
      content: generatedCommentary,
      date: format(new Date(), "yyyy-MM-dd HH:mm"),
    };

    const updated = [newReport, ...commentaryHistory];
    setCommentaryHistory(updated);
    localStorage.setItem("commentary_history", JSON.stringify(updated));
    alert("Report saved to history tab!");
  };

  const hfHeaderRef = useRef<HTMLTextAreaElement>(null);
  const hfFooterRef = useRef<HTMLTextAreaElement>(null);

  const applyFormatTag = (
    field: "header" | "footer",
    prefix: string,
    suffix: string = prefix,
  ) => {
    const ref = field === "header" ? hfHeaderRef : hfFooterRef;
    const value = field === "header" ? hfHeader : hfFooter;
    const setValue = field === "header" ? setHfHeader : setHfFooter;

    if (!ref.current) {
      setValue((prev) => prev + prefix + suffix);
      return;
    }

    const textarea = ref.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    const replacement = prefix + selectedText + suffix;
    const newValue =
      value.substring(0, start) + replacement + value.substring(end);

    setValue(newValue);

    setTimeout(() => {
      textarea.focus();
      const selectionStart = start + prefix.length;
      const selectionEnd = selectionStart + selectedText.length;
      textarea.setSelectionRange(selectionStart, selectionEnd);
    }, 0);
  };

  const insertHFTag = (field: "header" | "footer", tag: string) => {
    if (field === "header") {
      setHfHeader((prev) => {
        if (!prev) return tag;
        const endsWithNewline = prev.endsWith("\n");
        return prev + (endsWithNewline ? "" : "\n") + tag;
      });
    } else {
      setHfFooter((prev) => {
        if (!prev) return tag;
        const endsWithNewline = prev.endsWith("\n");
        return prev + (endsWithNewline ? "" : "\n") + tag;
      });
    }
  };

  const getStaticTimestamp = () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const formattedTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${formattedDate}, ${formattedTime}`;
  };

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(
    new Set(),
  );

  // Left Panel Expansion States
  const [isRawInputExpanded, setIsRawInputExpanded] = useState(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [isReportConfigExpanded, setIsReportConfigExpanded] = useState(true);
  const [isReportSelectionExpanded, setIsReportSelectionExpanded] =
    useState(true);

  // Right Panel Expansion States
  const [
    isIntelligenceInstructionsExpanded,
    setIsIntelligenceInstructionsExpanded,
  ] = useState(true);

  const [isReportInstructionsExpanded, setIsReportInstructionsExpanded] =
    useState(true);
  const [isReportPreviewExpanded, setIsReportPreviewExpanded] = useState(true);

  const [customAddOns, setCustomAddOns] = useState<
    { id: string; label: string; enabled: boolean }[]
  >([]);
  const [isAddingAddOn, setIsAddingAddOn] = useState(false);
  const [newAddOnLabel, setNewAddOnLabel] = useState("");

  const formatHFText = (text: string | null | undefined): string | null => {
    if (!text) return null;
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const formattedTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const formattedDateTime = `${formattedDate}, ${formattedTime}`;

    const formatted = text
      .replace(/\{\{DATE\}\}/g, formattedDate)
      .replace(/\{\{TIME\}\}/g, formattedTime)
      .replace(/\{\{DATETIME\}\}/g, formattedDateTime)
      .replace(/\{\{TIMESTAMP\}\}/g, formattedDateTime);

    return repairMarkdownHF(formatted);
  };

  const formatForMarkdownPreview = (
    text: string | null | undefined,
  ): string => {
    if (!text) return "";
    // Collapse three or more consecutive linebreaks to at most one blank line (\n\n)
    let cleaned = text.replace(/\n([ \t]*\n){2,}/g, "\n\n");
    // Collapse any blank line immediately after a bold header line to a single newline
    cleaned = cleaned.replace(/^(\*{1,2}[^*]+?\*{1,2}\s*\n)\s*\n+/gm, "$1");
    return cleaned
      .split("\n")
      .map((line) => (line.endsWith("  ") ? line : line + "  "))
      .join("\n");
  };

  const getNewsPreviewText = (item: NewsItem): string => {
    if (item.type !== "refined") {
      return item.raw_text;
    }
    const imgDetails =
      getRefinedImageDetails(item.summary_en) ||
      getRefinedImageDetails(item.summary_hi);
    if (imgDetails) {
      const cleanCaption = imgDetails.caption
        ? imgDetails.caption.replace(/[\*_`#\-]/g, "").trim()
        : "AI Rendered Market Graphic";
      return `🎨 Visual Concept: ${cleanCaption}`;
    }
    const textParts: string[] = [];
    if (item.summary_hi) {
      textParts.push(item.summary_hi);
    }
    if (item.summary_en) {
      textParts.push(item.summary_en);
    }
    const combined = textParts.join("\n\n");
    if (!combined) {
      return item.raw_text;
    }
    return combined
      .replace(/\*\*/g, "")
      .replace(/__/g, "")
      .replace(/~~/g, "")
      .replace(/`/g, "")
      .replace(/^#+\s+/gm, "")
      .replace(/^-\s+/gm, "• ")
      .trim();
  };

  const getHFSettings = (categoryId: number | undefined) => {
    if (!categoryId) return { header: null, footer: null };
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return { header: null, footer: null };

    let headerRaw: string | null = null;
    let footerRaw: string | null = null;

    // If it's a subcategory, look up the parent
    if (cat.parent_id) {
      const parent = categories.find((p) => p.id === cat.parent_id);
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
      footer: formatHFText(footerRaw),
    };
  };

  const [justCopiedId, setJustCopiedId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<"all" | "raw" | "refined">(
    "all",
  );
  const [activeTopTab, setActiveTopTab] = useState<"news" | "commentary">(
    "news",
  );
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("selected_gemini_model") || "gemini-3.5-flash";
  });
  const [selectedImageModel, setSelectedImageModel] = useState<string>(() => {
    return (
      localStorage.getItem("selected_imagen_model") || "gemini-2.5-flash-image"
    );
  });
  const [reportInstructions, setReportInstructions] = useState("");

  useEffect(() => {
    localStorage.setItem("selected_gemini_model", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem("selected_imagen_model", selectedImageModel);
  }, [selectedImageModel]);
  const [selectedRefinementIds, setSelectedRefinementIds] = useState<number[]>(
    [],
  );
  const [customRefinements, setCustomRefinements] = useState<
    {
      id: number;
      instruction: string;
      elaborated_prompt?: string | null;
      created_at?: string;
    }[]
  >([]);

  const refineInstructions = customRefinements
    .filter((r) => selectedRefinementIds.includes(r.id))
    .map((r) =>
      r.elaborated_prompt && r.elaborated_prompt.trim()
        ? r.elaborated_prompt.trim()
        : r.instruction,
    )
    .join("; ");
  const [isAddingRefinement, setIsAddingRefinement] = useState(false);
  const [newRefinementInstruction, setNewRefinementInstruction] = useState("");
  const [editingRefinementId, setEditingRefinementId] = useState<number | null>(
    null,
  );
  const [editingRefinementText, setEditingRefinementText] = useState("");
  const [editingElaboratedId, setEditingElaboratedId] = useState<number | null>(
    null,
  );
  const [elaboratedPromptText, setElaboratedPromptText] = useState("");
  const [deletingRefinementId, setDeletingRefinementId] = useState<
    number | null
  >(null);

  // Floating AI Refinement Focus Workspace states
  const [isFloatingRefinementOpen, setIsFloatingRefinementOpen] =
    useState(false);
  const [floatingPos, setFloatingPos] = useState({ x: 300, y: 100 });
  const [floatingSize, setFloatingSize] = useState({ width: 780, height: 520 });
  const [isDraggingWorkspace, setIsDraggingWorkspace] = useState(false);
  const [isResizingWorkspace, setIsResizingWorkspace] = useState(false);
  const dragStartOffset = useRef({ x: 0, y: 0 });
  const resizeStartSize = useRef({ width: 0, height: 0 });
  const resizeStartPos = useRef({ x: 0, y: 0 });

  const [workspaceActiveItemId, setWorkspaceActiveItemId] = useState<
    number | null
  >(null);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [workspaceEditingText, setWorkspaceEditingText] = useState("");
  const [workspaceEditingElaborated, setWorkspaceEditingElaborated] =
    useState("");
  const [workspaceIsNewItem, setWorkspaceIsNewItem] = useState(false);
  const [workspaceSaveSuccess, setWorkspaceSaveSuccess] = useState(false);

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, textarea, select"))
      return;
    setIsDraggingWorkspace(true);
    dragStartOffset.current = {
      x: e.clientX - floatingPos.x,
      y: e.clientY - floatingPos.y,
    };
    e.preventDefault();
  };

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsResizingWorkspace(true);
    resizeStartSize.current = { ...floatingSize };
    resizeStartPos.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    e.stopPropagation();
  };

  // Sync workspace details when selected item changes
  useEffect(() => {
    if (workspaceActiveItemId !== null && !workspaceIsNewItem) {
      const activeItem = customRefinements.find(
        (r) => r.id === workspaceActiveItemId,
      );
      if (activeItem) {
        setWorkspaceEditingText(activeItem.instruction);
        setWorkspaceEditingElaborated(activeItem.elaborated_prompt || "");
      }
    } else if (workspaceIsNewItem) {
      setWorkspaceEditingText("");
      setWorkspaceEditingElaborated("");
    }
  }, [workspaceActiveItemId, workspaceIsNewItem, customRefinements]);

  // Document Move/Up hook for draggable/resizable window
  useEffect(() => {
    const handlePointerMove = (e: MouseEvent) => {
      if (isDraggingWorkspace) {
        setFloatingPos({
          x: Math.max(
            0,
            Math.min(
              window.innerWidth - 150,
              e.clientX - dragStartOffset.current.x,
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              window.innerHeight - 80,
              e.clientY - dragStartOffset.current.y,
            ),
          ),
        });
      }
      if (isResizingWorkspace) {
        const deltaX = e.clientX - resizeStartPos.current.x;
        const deltaY = e.clientY - resizeStartPos.current.y;

        const newWidth = Math.max(500, resizeStartSize.current.width + deltaX);
        const newHeight = Math.max(
          350,
          resizeStartSize.current.height + deltaY,
        );

        setFloatingSize({
          width: Math.min(window.innerWidth - 40, newWidth),
          height: Math.min(window.innerHeight - 40, newHeight),
        });
      }

      if (isDraggingSettings) {
        setSettingsPos({
          x: Math.max(
            0,
            Math.min(
              window.innerWidth - 150,
              e.clientX - settingsDragStartOffset.current.x,
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              window.innerHeight - 80,
              e.clientY - settingsDragStartOffset.current.y,
            ),
          ),
        });
      }
      if (activeResizeSettingsDir) {
        const dx = e.clientX - settingsResizeStartPos.current.x;
        const dy = e.clientY - settingsResizeStartPos.current.y;
        const start = settingsResizeStartRect.current;
        const limitW = 750;
        const limitH = 450;

        let finalW = start.width;
        let finalH = start.height;
        let finalX = start.x;
        let finalY = start.y;

        if (activeResizeSettingsDir.includes("e")) {
          finalW = Math.max(limitW, start.width + dx);
        } else if (activeResizeSettingsDir.includes("w")) {
          const possibleW = start.width - dx;
          if (possibleW >= limitW) {
            finalW = possibleW;
            finalX = start.x + dx;
          } else {
            finalW = limitW;
            finalX = start.x + (start.width - limitW);
          }
        }

        if (activeResizeSettingsDir.includes("s")) {
          finalH = Math.max(limitH, start.height + dy);
        } else if (activeResizeSettingsDir.includes("n")) {
          const possibleH = start.height - dy;
          if (possibleH >= limitH) {
            finalH = possibleH;
            finalY = start.y + dy;
          } else {
            finalH = limitH;
            finalY = start.y + (start.height - limitH);
          }
        }

        setSettingsSize({
          width: Math.min(window.innerWidth - 40, finalW),
          height: Math.min(window.innerHeight - 40, finalH)
        });
        setSettingsPos({
          x: Math.max(0, Math.min(window.innerWidth - 150, finalX)),
          y: Math.max(0, Math.min(window.innerHeight - 80, finalY))
        });
      }
    };

    const handlePointerUp = () => {
      setIsDraggingWorkspace(false);
      setIsResizingWorkspace(false);
      setIsDraggingSettings(false);
      setActiveResizeSettingsDir(null);
    };

    if (isDraggingWorkspace || isResizingWorkspace || isDraggingSettings || activeResizeSettingsDir) {
      document.addEventListener("mousemove", handlePointerMove);
      document.addEventListener("mouseup", handlePointerUp);
    }

    return () => {
      document.removeEventListener("mousemove", handlePointerMove);
      document.removeEventListener("mouseup", handlePointerUp);
    };
  }, [isDraggingWorkspace, isResizingWorkspace, isDraggingSettings, activeResizeSettingsDir]);

  // Create refinement helper specifically for workspace
  const handleCreateRefinementFromWorkspace = async (
    instruction: string,
    elaboratedPrompt: string | null,
  ) => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    try {
      const response = await fetch("/api/custom-refinements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: trimmed,
          elaborated_prompt: elaboratedPrompt ? elaboratedPrompt.trim() : null,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        await fetchCustomRefinements();
        setWorkspaceActiveItemId(data.id);
        setWorkspaceIsNewItem(false);
        setWorkspaceSaveSuccess(true);
        setTimeout(() => setWorkspaceSaveSuccess(false), 2000);
        setSelectedRefinementIds((prev) =>
          prev.includes(data.id) ? prev : [...prev, data.id],
        );
      } else {
        const err = await response.json();
        alert(err.error || "Failed to save instruction");
      }
    } catch (error) {
      console.error("Failed to create custom refinement in workspace:", error);
    }
  };
  const [demoDaysAgo, setDemoDaysAgo] = useState(0);
  const [timeFilter, setTimeFilter] = useState<
    "today" | "yesterday" | "1week" | "2week" | "1month" | "3month" | "custom" | "stared"
  >("today");
  const isStarredOnly = timeFilter === "stared";
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(
    undefined,
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState<"from" | "to" | false>(
    false,
  );
  const calendarRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState<
    "desktop" | "whatsapp" | "raw" | "image"
  >("desktop");
  const [reportZoom, setReportZoom] = useState(1);
  const [newsZoom, setNewsZoom] = useState(1);
  const [isWhatsAppExpanded, setIsWhatsAppExpanded] = useState(false);

  const [reportOptions, setReportOptions] = useState({
    withHeadline: true,
    headlineOption: "standard" as
      | "none"
      | "standard"
      | "ai_symbol"
      | "custom_symbol",
    headlineSymbol: "🟤",
    withHeader: false,
    withFooter: false,
    language: "both" as "en" | "hi" | "both",
    order: "hi-en" as "en-hi" | "hi-en",
    format: "custom_symbol" as "paragraph" | "bullet" | "ai_symbol" | "custom_symbol",
    bulletSymbol: "•",
    length: "short" as "short" | "medium" | "normal",
    lineLimit: "",
    includeSentiment: false,
    extractFigures: false,
    addImpact: false,
    generateTags: false,
  });

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [criteriaList, setCriteriaList] = useState<CriteriaItem[]>([]);
  const [copyPendingItem, setCopyPendingItem] = useState<{
    id: number;
    content: string;
  } | null>(null);
  const [criteriaFilter, setCriteriaFilter] = useState<number | "all">("all");
  const [isCriteriaMenuExpanded, setIsCriteriaMenuExpanded] = useState(false);
  const [editingCriteriaId, setEditingCriteriaId] = useState<number | null>(
    null,
  );
  const criteriaMenuRef = useRef<HTMLDivElement>(null);
  const [isThemeMenuExpanded, setIsThemeMenuExpanded] = useState(false);
  const [isZoomMenuExpanded, setIsZoomMenuExpanded] = useState(false);
  const [isLanguageMenuExpanded, setIsLanguageMenuExpanded] = useState(false);
  const [isOrderMenuExpanded, setIsOrderMenuExpanded] = useState(false);
  const [isFormatMenuExpanded, setIsFormatMenuExpanded] = useState(false);
  const [isHeadlineMenuExpanded, setIsHeadlineMenuExpanded] = useState(false);
  const [isTimeMenuExpanded, setIsTimeMenuExpanded] = useState(false);
  const [isFeedMenuExpanded, setIsFeedMenuExpanded] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const orderMenuRef = useRef<HTMLDivElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const headlineMenuRef = useRef<HTMLDivElement>(null);
  const timeMenuRef = useRef<HTMLDivElement>(null);
  const feedMenuRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isGenerateCriteriaModalOpen, setIsGenerateCriteriaModalOpen] = useState(false);
  const [generationRefineTarget, setGenerationRefineTarget] = useState<NewsItem | null>(null);
  const [generationSelectedCriteriaId, setGenerationSelectedCriteriaId] = useState<number | null>(null);

  const openGenerateCriteriaModal = (item: NewsItem) => {
    setGenerationRefineTarget(item);
    // Pre-select first criteria if available, otherwise null
    const defaultId = criteriaList.length > 0 ? criteriaList[0].id : null;
    setGenerationSelectedCriteriaId(defaultId);
    setIsGenerateCriteriaModalOpen(true);
  };

  const [inputPlacement, setInputPlacement] = useState<"left" | "top">("left");
  const [textareaHeightLeft, setTextareaHeightLeft] = useState(96);
  const [textareaHeightTop, setTextareaHeightTop] = useState(64);
  const isResizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const resizingLocationRef = useRef<"left" | "top">("left");

  const handleInputAreaResizeStart = (e: React.MouseEvent, location: "left" | "top") => {
    e.preventDefault();
    isResizingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = location === "left" ? textareaHeightLeft : textareaHeightTop;
    resizingLocationRef.current = location;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaY = e.clientY - startYRef.current;
      const newHeight = Math.max(40, Math.min(600, startHeightRef.current + deltaY));
      if (resizingLocationRef.current === "left") {
        setTextareaHeightLeft(newHeight);
      } else {
        setTextareaHeightTop(newHeight);
      }
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        zoomMenuRef.current &&
        !zoomMenuRef.current.contains(event.target as Node)
      ) {
        setIsZoomMenuExpanded(false);
      }
      if (
        themeMenuRef.current &&
        !themeMenuRef.current.contains(event.target as Node)
      ) {
        setIsThemeMenuExpanded(false);
      }
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setIsLanguageMenuExpanded(false);
      }
      if (
        orderMenuRef.current &&
        !orderMenuRef.current.contains(event.target as Node)
      ) {
        setIsOrderMenuExpanded(false);
      }
      if (
        formatMenuRef.current &&
        !formatMenuRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(".format-dropdown")
      ) {
        setIsFormatMenuExpanded(false);
      }
      if (
        headlineMenuRef.current &&
        !headlineMenuRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(".headline-dropdown")
      ) {
        setIsHeadlineMenuExpanded(false);
      }
      if (
        timeMenuRef.current &&
        !timeMenuRef.current.contains(event.target as Node)
      ) {
        setIsTimeMenuExpanded(false);
      }
      if (
        feedMenuRef.current &&
        !feedMenuRef.current.contains(event.target as Node)
      ) {
        setIsFeedMenuExpanded(false);
      }
      if (
        criteriaMenuRef.current &&
        !criteriaMenuRef.current.contains(event.target as Node)
      ) {
        setIsCriteriaMenuExpanded(false);
      }
    };

    if (
      isZoomMenuExpanded ||
      isThemeMenuExpanded ||
      isLanguageMenuExpanded ||
      isOrderMenuExpanded ||
      isFormatMenuExpanded ||
      isHeadlineMenuExpanded ||
      isTimeMenuExpanded ||
      isFeedMenuExpanded ||
      isCriteriaMenuExpanded
    ) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [
    isZoomMenuExpanded,
    isThemeMenuExpanded,
    isLanguageMenuExpanded,
    isOrderMenuExpanded,
    isFormatMenuExpanded,
    isHeadlineMenuExpanded,
    isTimeMenuExpanded,
    isFeedMenuExpanded,
    isCriteriaMenuExpanded,
  ]);

  // Handle theme effect
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Handle global zoom effect
  useEffect(() => {
    document.documentElement.style.fontSize = `${zoomLevel}%`;
  }, [zoomLevel]);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 10, 150));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 10, 70));
  };

  const [refineOptions, setRefineOptions] = useState({
    withHeadline: true,
    headlineOption: "standard" as
      | "none"
      | "standard"
      | "ai_symbol"
      | "custom_symbol",
    headlineSymbol: "🟤",
    withHeader: false,
    withFooter: false,
    language: "both" as "en" | "hi" | "both",
    order: "hi-en" as "en-hi" | "hi-en",
    format: "custom_symbol" as "paragraph" | "bullet" | "ai_symbol" | "custom_symbol",
    bulletSymbol: "•",
    length: "short" as "short" | "medium" | "normal",
    lineLimit: "",
    includeSentiment: false,
    extractFigures: false,
    addImpact: false,
    generateTags: false,
  });

  const [formatDropdownTop, setFormatDropdownTop] = useState<number>(-10);
  const formatDropdownRef = useRef<HTMLDivElement>(null);
  const [headlineDropdownTop, setHeadlineDropdownTop] = useState<number>(-10);
  const headlineDropdownRef = useRef<HTMLDivElement>(null);

  const adjustFormatDropdownPosition = () => {
    if (formatMenuRef.current && formatDropdownRef.current) {
      const triggerRect = formatMenuRef.current.getBoundingClientRect();
      const dropdownHeight = formatDropdownRef.current.offsetHeight || 300;
      const windowHeight = window.innerHeight;

      let offset = -10; // ideal starting offset

      // If we overflow the bottom
      if (triggerRect.top + offset + dropdownHeight > windowHeight - 10) {
        offset = windowHeight - 10 - triggerRect.top - dropdownHeight;
      }

      // If we overflow the top
      if (triggerRect.top + offset < 10) {
        offset = 10 - triggerRect.top;
      }

      setFormatDropdownTop(offset);
    }
  };

  const adjustHeadlineDropdownPosition = () => {
    if (headlineMenuRef.current && headlineDropdownRef.current) {
      const triggerRect = headlineMenuRef.current.getBoundingClientRect();
      const dropdownHeight = headlineDropdownRef.current.offsetHeight || 300;
      const windowHeight = window.innerHeight;

      let offset = -10; // ideal starting offset

      // If we overflow the bottom
      if (triggerRect.top + offset + dropdownHeight > windowHeight - 10) {
        offset = windowHeight - 10 - triggerRect.top - dropdownHeight;
      }

      // If we overflow the top
      if (triggerRect.top + offset < 10) {
        offset = 10 - triggerRect.top;
      }

      setHeadlineDropdownTop(offset);
    }
  };

  useEffect(() => {
    if (isFormatMenuExpanded) {
      const timer = setTimeout(adjustFormatDropdownPosition, 25);
      window.addEventListener("resize", adjustFormatDropdownPosition);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("resize", adjustFormatDropdownPosition);
      };
    }
  }, [isFormatMenuExpanded, refineOptions.format, refineOptions.bulletSymbol]);

  useEffect(() => {
    if (isHeadlineMenuExpanded) {
      const timer = setTimeout(adjustHeadlineDropdownPosition, 25);
      window.addEventListener("resize", adjustHeadlineDropdownPosition);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("resize", adjustHeadlineDropdownPosition);
      };
    }
  }, [
    isHeadlineMenuExpanded,
    refineOptions.headlineOption,
    refineOptions.headlineSymbol,
  ]);

  const [sidebarWidth, setSidebarWidth] = useState(300); // Pixels
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSidebarCruds, setShowSidebarCruds] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("showSidebarCruds");
      return saved ? saved === "true" : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("showSidebarCruds", String(showSidebarCruds));
    } catch (e) {}
  }, [showSidebarCruds]);
  const [leftWidth, setLeftWidth] = useState(50); // Percentage
  const [lastWidth, setLastWidth] = useState(50);
  const [maximizedPanel, setMaximizedPanel] = useState<"left" | "right" | null>(
    null,
  );
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isRegenOpen, setIsRegenOpen] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [correctionImages, setCorrectionImages] = useState<string[]>([]);
  const correctionFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsRegenOpen(false);
    setRegenInstruction("");
    setCorrectionImages([]);
  }, [selectedNews?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [calendarRef]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/categories");
      const data = await response.json();
      setCategories(data);
      if (data.length > 0) {
        if (!activeCategory) {
          setActiveCategory(data[0].name);
          setActiveCategoryId(data[0].id);
          setSelectedCategoryIds((prev) => {
            if (prev.size === 0) {
              const children = data
                .filter((c: any) => c.parent_id === data[0].id)
                .map((c: any) => Number(c.id));
              return new Set([Number(data[0].id), ...children]);
            }
            return prev;
          });
        } else if (!activeCategoryId) {
          const current = data.find((c: any) => c.name === activeCategory);
          if (current) {
            setActiveCategoryId(current.id);
            setSelectedCategoryIds((prev) => {
              if (prev.size === 0) {
                const isParent = current.parent_id === null;
                if (isParent) {
                  const children = data
                    .filter((c: any) => c.parent_id === current.id)
                    .map((c: any) => Number(c.id));
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
      console.error("Failed to fetch categories:", error);
    }
  }, [activeCategory, activeCategoryId]);

  const fetchApiKeys = useCallback(async () => {
    try {
      const response = await fetch("/api/keys");
      const data = await response.json();
      setApiKeys(data);
    } catch (error) {
      console.error("Failed to fetch API keys:", error);
    }
  }, []);

  const fetchPrompts = useCallback(async () => {
    try {
      const response = await fetch("/api/prompts");
      if (response.ok) {
        const data: PromptTemplate[] = await response.json();
        const map = data.reduce(
          (acc, curr) => ({ ...acc, [curr.key]: curr }),
          {},
        );
        setPromptTemplates(map);
      }
    } catch (error) {
      console.error("Failed to fetch prompts:", error);
    }
  }, []);

  const fetchCustomRefinements = useCallback(async () => {
    try {
      const response = await fetch("/api/custom-refinements");
      if (response.ok) {
        const data = await response.json();
        setCustomRefinements(data);
      }
    } catch (error) {
      console.error("Failed to fetch custom refinements:", error);
    }
  }, []);

  const fetchCriteria = useCallback(async () => {
    try {
      const response = await fetch("/api/criteria");
      if (response.ok) {
        const data = await response.json();
        setCriteriaList(data);
      }
    } catch (error) {
      console.error("Failed to fetch criteria:", error);
    }
  }, []);

  const fetchReportingCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append("period", reportingPeriod);
      if (reportingPeriod === "custom") {
        if (reportingCustomFrom) params.append("from", reportingCustomFrom);
        if (reportingCustomTo) params.append("to", reportingCustomTo);
      }
      params.append("newsType", reportingNewsType);
      params.append("criteriaFilter", String(reportingCriteriaFilter));
      params.append("starred", reportingStarredOnly ? "only" : "all");
      if (reportingStarredOnly) {
        params.append("starredIds", Array.from(starredNewsIds).join(","));
      }
      const res = await fetch(`/api/reporting/counts?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as {
          category_id: number | null;
          count: number;
        }[];
        const countsMap: Record<number, number> = {};
        data.forEach((item) => {
          if (item.category_id !== null) {
            countsMap[item.category_id] = item.count;
          }
        });
        setReportingCounts(countsMap);
      }
    } catch (error) {
      console.error("Failed to fetch reporting counts:", error);
    }
  }, [
    reportingPeriod,
    reportingCustomFrom,
    reportingCustomTo,
    reportingNewsType,
    reportingCriteriaFilter,
    reportingStarredOnly,
    starredNewsIds,
  ]);

  useEffect(() => {
    if ((isSettingsOpen && activeSettingsTab === "reporting") || showCountsInSidebar) {
      fetchReportingCounts();
    }
  }, [
    isSettingsOpen,
    activeSettingsTab,
    showCountsInSidebar,
    reportingPeriod,
    reportingCustomFrom,
    reportingCustomTo,
    reportingNewsType,
    reportingCriteriaFilter,
    reportingStarredOnly,
    newsFeed,
    fetchReportingCounts,
  ]);

  const handleUpdateNewsCriteria = async (
    newsId: number,
    criteriaId: number | null,
  ) => {
    try {
      const response = await fetch(`/api/news/${newsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria_id: criteriaId }),
      });
      if (response.ok) {
        setNewsFeed((prev) =>
          prev.map((item) =>
            item.id === newsId ? { ...item, criteria_id: criteriaId } : item,
          ),
        );
        setSelectedNews((prev) => {
          if (prev && prev.id === newsId) {
            return { ...prev, criteria_id: criteriaId };
          }
          return prev;
        });
      }
    } catch (error) {
      console.error("Failed to update news criteria:", error);
    }
  };

  const callGeminiWithFallback = async (
    prompt: string,
    schema?: any,
    images?: { data: string; mimeType: string }[],
  ) => {
    const activeKeys = apiKeys
      .filter((k) => k.is_active === 1)
      .sort((a, b) => a.sort_order - b.sort_order);

    const doGenerate = async (apiKey?: string) => {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          schema,
          images,
          api_key: apiKey,
          model: selectedModel,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to generate text: ${response.status}`,
        );
      }
      const data = await response.json();
      return { text: data.text };
    };

    if (activeKeys.length === 0) {
      return await doGenerate();
    }

    for (const key of activeKeys) {
      if (key.status === "exhausted" || key.status === "invalid") continue;

      try {
        const res = await doGenerate(key.api_key);

        await fetch(`/api/keys/${key.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usage_count: key.usage_count + 1,
            last_used_at: new Date().toISOString(),
          }),
        });

        fetchApiKeys();
        return res;
      } catch (error: any) {
        console.error(`Key ${key.name} failed:`, error);

        const errorMessage = error?.message || String(error);

        if (
          errorMessage.includes("429") ||
          errorMessage.toLowerCase().includes("quota") ||
          errorMessage.toLowerCase().includes("exhausted")
        ) {
          await fetch(`/api/keys/${key.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "exhausted" }),
          });
        } else if (
          errorMessage.includes("400") ||
          errorMessage.includes("403") ||
          errorMessage.toLowerCase().includes("not valid")
        ) {
          await fetch(`/api/keys/${key.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "invalid" }),
          });
        }
        fetchApiKeys();
      }
    }

    throw new Error(
      "All available API keys have been exhausted or are invalid.",
    );
  };

  const callGeminiImageWithFallback = async (prompt: string) => {
    const activeKeys = apiKeys
      .filter((k) => k.is_active === 1)
      .sort((a, b) => a.sort_order - b.sort_order);

    const doGenerate = async (apiKey?: string) => {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          api_key: apiKey,
          model: selectedImageModel,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to generate image: ${response.status}`,
        );
      }
      const data = await response.json();
      return data.image;
    };

    if (activeKeys.length === 0) {
      return await doGenerate();
    }

    for (const key of activeKeys) {
      if (key.status === "exhausted" || key.status === "invalid") continue;
      try {
        const result = await doGenerate(key.api_key);
        await fetch(`/api/keys/${key.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usage_count: key.usage_count + 1,
            last_used_at: new Date().toISOString(),
          }),
        });
        fetchApiKeys();
        return result;
      } catch (error: any) {
        console.error(`Key ${key.name} failed during image generation:`, error);
        // Note: We DO NOT mark the key as exhausted or invalid on image generation failure.
        // This is because free-tier Gemini API keys (standard on Google AI Studio) often
        // DO NOT have image generation/interaction quota, but are completely valid and
        // have plenty of free quota for standard text-only summaries and reports.
        fetchApiKeys();
      }
    }
    throw new Error(
      "Image generation is not supported or out of quota on these API keys. Note: free-tier Gemini keys generally do not have image generation quota, but work perfectly for text-only summaries and reports! Please use standard text-only mode for your synthesis.",
    );
  };

  useEffect(() => {
    fetchCategories();
    fetchApiKeys();
    fetchPrompts();
    fetchCustomRefinements();
    fetchCriteria();
  }, [
    fetchCategories,
    fetchApiKeys,
    fetchPrompts,
    fetchCustomRefinements,
    fetchCriteria,
  ]);

  const isDuplicateName = (
    name: string,
    parentId: number | null,
    excludeId: number | null = null,
  ) => {
    return categories.some(
      (c) =>
        c.id !== excludeId &&
        (c.parent_id || null) === (parentId || null) &&
        c.name.toLowerCase() === name.trim().toLowerCase(),
    );
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setAddingToParentId(null);
      return;
    }

    // Duplicate check
    if (isDuplicateName(newCategoryName, null)) {
      alert(
        `A section named "${newCategoryName}" already exists at the top level.`,
      );
      return;
    }

    setIsAddingCategory(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName }),
      });
      if (response.ok) {
        const newCat = await response.json();
        await fetchCategories();
        setActiveCategory(newCategoryName);
        setActiveCategoryId(newCat.id);
        setNewCategoryName("");
        setAddingToParentId(null);
      }
    } catch (error) {
      console.error("Failed to add category:", error);
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
    const catToEdit = categories.find((c) => c.id === id);
    if (!catToEdit) return;

    if (isDuplicateName(editingCategoryName, catToEdit.parent_id || null, id)) {
      alert(
        `A section named "${editingCategoryName}" already exists in this level.`,
      );
      return;
    }

    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingCategoryName.trim() }),
      });
      if (response.ok) {
        await fetchCategories();
        if (activeCategoryId === id) {
          setActiveCategory(editingCategoryName.trim());
        }
      }
    } catch (error) {
      console.error("Failed to update category:", error);
    } finally {
      setEditingCategoryId(null);
      setEditingCategoryName("");
    }
  };

  const handleSaveHeaderFooter = async () => {
    if (!hfEditingCategory) return;
    try {
      const response = await fetch(`/api/categories/${hfEditingCategory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header_text: hfHeader,
          footer_text: hfFooter,
          is_header_active: isHfHeaderActive,
          is_footer_active: isHfFooterActive,
        }),
      });
      if (response.ok) {
        setCategories(
          categories.map((c) =>
            c.id === hfEditingCategory.id
              ? {
                  ...c,
                  header_text: hfHeader,
                  footer_text: hfFooter,
                  is_header_active: isHfHeaderActive ? 1 : 0,
                  is_footer_active: isHfFooterActive ? 1 : 0,
                }
              : c,
          ),
        );
        setIsHeaderFooterModalOpen(false);
      } else {
        const errData = await response.json();
        alert(
          `Failed to save settings: ${errData.details || errData.error || "Server error"}`,
        );
      }
    } catch (error) {
      console.error("Failed to save header/footer settings:", error);
      alert("Network or client error in saving header/footer settings.");
    }
  };

  const handleAddCustomRefinement = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const response = await fetch("/api/custom-refinements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: trimmed }),
      });
      if (response.ok) {
        await fetchCustomRefinements();
      } else {
        const err = await response.json();
        alert(err.error || "Failed to save instruction");
      }
    } catch (error) {
      console.error("Failed to create custom refinement:", error);
    }
  };

  const handleUpdateCustomRefinement = async (id: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const response = await fetch(`/api/custom-refinements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: trimmed }),
      });
      if (response.ok) {
        await fetchCustomRefinements();
        setEditingRefinementId(null);
        setEditingRefinementText("");
      } else {
        const err = await response.json();
        alert(err.error || "Failed to edit instruction");
      }
    } catch (error) {
      console.error("Failed to update custom refinement:", error);
    }
  };

  const handleUpdateCustomRefinementElaborated = async (
    id: number,
    instruction: string,
    elaboratedPrompt: string | null,
  ) => {
    try {
      const response = await fetch(`/api/custom-refinements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          elaborated_prompt: elaboratedPrompt,
        }),
      });
      if (response.ok) {
        await fetchCustomRefinements();
        setEditingElaboratedId(null);
        setElaboratedPromptText("");
      } else {
        const err = await response.json();
        alert(err.error || "Failed to update elaborated prompt");
      }
    } catch (error) {
      console.error(
        "Failed to update custom refinement elaborated prompt:",
        error,
      );
    }
  };

  const handleDeleteCustomRefinement = async (id: number) => {
    try {
      const response = await fetch(`/api/custom-refinements/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchCustomRefinements();
        if (deletingRefinementId === id) {
          setDeletingRefinementId(null);
        }
      } else {
        console.error("Failed to delete custom instruction");
      }
    } catch (error) {
      console.error("Failed to delete custom refinement:", error);
    }
  };

  const handleAddSubCategory = async (parentId: number) => {
    if (!newCategoryName.trim()) {
      setAddingToParentId(null);
      return;
    }

    // Duplicate check
    if (isDuplicateName(newCategoryName, parentId)) {
      alert(
        `A sub-section named "${newCategoryName}" already exists in this section.`,
      );
      return;
    }

    setIsAddingCategory(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName, parent_id: parentId }),
      });

      if (response.ok) {
        const newCat = await response.json();
        await fetchCategories();
        setExpandedCategories((prev) => ({ ...prev, [parentId]: true }));
        setActiveCategory(newCategoryName);
        setActiveCategoryId(newCat.id);
        setNewCategoryName("");
        setAddingToParentId(null);
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || "Failed to add sub-section"}`);
      }
    } catch (error) {
      console.error("Failed to add sub-category:", error);
      alert("Failed to connect to server. Please try again.");
    } finally {
      setIsAddingCategory(false);
    }
  };

  const toggleCategorySelection = (
    e: React.MouseEvent,
    id: number | string,
  ) => {
    e.stopPropagation();
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      const isSelected = next.has(Number(id));
      const targetId = Number(id);

      const cat = categories.find((c) => c.id == id);
      if (!cat) return next;

      const isSubcategory =
        cat.parent_id !== null && cat.parent_id !== undefined;

      if (isSubcategory) {
        // Toggling a child
        if (isSelected) {
          next.delete(targetId);
          // Uncheck parent implicitly, since not all children are checked
          if (cat.parent_id) next.delete(cat.parent_id);
        } else {
          next.add(targetId);
          // Check if all siblings are now checked, if so, check the parent
          const siblings = categories.filter(
            (c) => c.parent_id === cat.parent_id,
          );
          const allSiblingsChecked = siblings.every((sibling) =>
            next.has(sibling.id),
          );
          if (allSiblingsChecked && cat.parent_id) {
            next.add(cat.parent_id);
          } else if (cat.parent_id) {
            // Ensure parent is unchecked if not all siblings are checked
            next.delete(cat.parent_id);
          }
        }
      } else {
        // Toggling a parent
        const childrenIds = categories
          .filter((c) => c.parent_id == targetId)
          .map((c) => c.id);
        if (isSelected) {
          next.delete(targetId);
          childrenIds.forEach((childId) => next.delete(childId));
        } else {
          next.add(targetId);
          childrenIds.forEach((childId) => next.add(childId));
        }
      }

      return next;
    });
  };

  const toggleCategory = (id: number) => {
    setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Fetch news feed for the active category
  const fetchFeed = useCallback(async () => {
    if (selectedCategoryIds.size === 0) {
      setNewsFeed([]);
      return;
    }
    setIsLoadingFeed(true);
    try {
      const ids = Array.from(selectedCategoryIds).join(",");
      const response = await fetch(`/api/news/multi?ids=${ids}`);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setNewsFeed(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch news feed:", error);
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
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setReportsList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      setReportsList([]);
    } finally {
      setIsLoadingReports(false);
    }
  }, [activeCategoryId]);

  const fetchTrash = useCallback(async (categoryId?: number | null) => {
    setIsLoadingTrash(true);
    try {
      const url = categoryId
        ? `/api/trash?category_id=${categoryId}`
        : "/api/trash";
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setTrashItems({
        news: Array.isArray(data.news) ? data.news : [],
        reports: Array.isArray(data.reports) ? data.reports : [],
      });
    } catch (error) {
      console.error("Failed to fetch trash:", error);
      setTrashItems({ news: [], reports: [] });
    } finally {
      setIsLoadingTrash(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "intelligence") {
      fetchFeed();
    } else if (viewMode === "trash") {
      fetchTrash(activeCategoryId);
    }
  }, [fetchFeed, fetchReports, fetchTrash, viewMode, activeCategoryId]);

  const handleProcess = async () => {
    if ((!inputText.trim() && inputImages.length === 0) || !activeCategoryId)
      return;

    let targetId = activeCategoryId;
    let targetName = activeCategory;
    const cat = categories.find((c) => c.id === activeCategoryId);
    if (cat && !cat.parent_id) {
      const sub = categories.find((c) => c.parent_id === activeCategoryId);
      if (sub) {
        targetId = sub.id;
        targetName = sub.name;
      }
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: targetId,
          category_name: targetName,
          raw_text: inputText,
          images: inputImages,
          type: "raw",
        }),
      });

      if (response.ok) {
        setInputText("");
        setInputImages([]);
        await fetchFeed(); // Refresh the list
      }
    } catch (error) {
      console.error("Failed to save news:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddDemoNews = async () => {
    if (!activeCategoryId) return;
    const demoTexts: Record<string, string> = {
      METAL: `Gold prices surged to a new record high of $2,350 per ounce as central banks continued their aggressive buying spree.
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
      ENERGY: `Oil prices stabilized around $85 per barrel following a surprise draw in US crude inventories.
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
      AGRICULTURE: `Wheat futures rose by 3% today due to unfavorable weather conditions in key growing regions.
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
      DEFAULT: `Global market indices showed mixed results today as investors awaited the latest inflation data.
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
Long-term investors are focusing on quality and defensive sectors in an environment of economic uncertainty.`,
    };

    const text =
      demoTexts[activeCategory.toUpperCase()] || demoTexts["DEFAULT"];

    // Calculate backdated timestamp
    let createdAt = null;
    if (demoDaysAgo > 0) {
      const date = new Date();
      date.setDate(date.getDate() - demoDaysAgo);
      createdAt = date.toISOString();
    }

    let targetId = activeCategoryId;
    let targetName = activeCategory;
    const cat = categories.find((c) => c.id === activeCategoryId);
    if (cat && !cat.parent_id) {
      const sub = categories.find((c) => c.parent_id === activeCategoryId);
      if (sub) {
        targetId = sub.id;
        targetName = sub.name;
      }
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: targetId,
          category_name: targetName,
          raw_text: text,
          type: "raw",
          created_at: createdAt,
        }),
      });

      if (response.ok) {
        await fetchFeed();
      }
    } catch (error) {
      console.error("Failed to save demo news:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getHeadlinePromptInstruction = (
    withHeadline: boolean,
    headlineOption: "none" | "standard" | "ai_symbol" | "custom_symbol",
    headlineSymbol: string,
    fallbackInstruction?: string,
  ) => {
    if (!withHeadline || headlineOption === "none") {
      return "- Do NOT generate a headline. Do not include any title or headline text at the beginning of the response; directly output the summary content.";
    }
    const opt = headlineOption || "standard";
    const base =
      fallbackInstruction ||
      "- Standalone eye-catching headline summarizing the major insight at the start.";
    if (opt === "standard") {
      return `${base}\n- Do NOT prepend any special symbols, icons, or emojis to the headline. Simply output the headline text directly.`;
    }
    if (opt === "ai_symbol") {
      return `${base}\n- You MUST choose and prepend the headline text with a relevant, topic-appropriate AI-defined symbol or emoji that perfectly matches raw content categories (for example: 🔴 for breaking/emergency news, 📈 for market gains, 📉 for market losses, 🏥 for health, ⚽ for sports, etc.) as the very first character of the headline.`;
    }
    if (opt === "custom_symbol") {
      return `${base}\n- You MUST prepend the headline text with the exact symbol "${headlineSymbol || "🟤"}" as the very first character of the headline (followed by a space and then the headline text).`;
    }
    return base;
  };

  const getFormatPromptInstruction = (
    format: "paragraph" | "bullet" | "ai_symbol" | "custom_symbol",
    bulletSymbol: string,
    fallbackParagraph?: string,
    fallbackBullet?: string,
  ) => {
    if (format === "paragraph") {
      return (
        fallbackParagraph ||
        "- Format: Write the summary as cohesive, clear paragraphs. Do NOT use any list format, bullets, dashes, or numbered points."
      );
    }
    if (format === "bullet") {
      return (
        fallbackBullet ||
        `- Format: STRICTLY use standard bullet points. Every single sentence or distinct idea MUST be on its own separate line and MUST begin with the markdown dash character "-" followed by a space. DO NOT use the dot character "•". NEVER use paragraphs. This exact formatting MUST be applied flawlessly to BOTH English and Hindi versions.`
      );
    }
    if (format === "ai_symbol") {
      return `- Format: Use custom bullet points. Each point/list item MUST be on its own line and start directly with a highly relevant, context-rich custom symbol or emoji selected by you (the AI) that perfectly matches that specific point's content or sentiment (for example, 📈 for growth, 📉 for drops, 📣 for announcements, ⚡ for high volatility, etc.) followed by a space. Do NOT use standard bullet characters like "•" or dashes "-" or asterisks "*". This EXACT formatting MUST be independently applied to BOTH English and Hindi translations.`;
    }
    if (format === "custom_symbol") {
      return `- Format: Use custom bullet points. Each point/list item MUST be on its own line and start directly with the exact symbol "${bulletSymbol || "•"}" followed by a space. Do NOT use standard bullet characters like "•" (unless that is the selected symbol) or dashes "-" or asterisks "*". This EXACT formatting MUST be independently applied to BOTH English and Hindi translations.`;
    }
    return fallbackBullet || "- Format: Use bullet points.";
  };

  const handleRefine = async (item: NewsItem, criteriaId: number | null = null) => {
    if (!item.raw_text && (!item.images || item.images.length === 0)) return;

    setIsRefining(true);
    try {
      const prompt = `
        You are a senior commodity market analyst. Refine the following raw news intelligence for the ${activeCategory} market.
        
        RAW NEWS:
        ${item.raw_text || "[Images attached for analysis]"}
        
        INSTRUCTIONS:
        ${getHeadlinePromptInstruction(
          refineOptions.withHeadline,
          refineOptions.headlineOption,
          refineOptions.headlineSymbol,
          promptTemplates["headline_format"]?.instruction,
        )}
        ${refineOptions.withHeader ? "- Include a professional header identifying the source and category." : ""}
        ${refineOptions.withFooter ? "- Include a professional footer with market disclaimers." : ""}
        - Language: ${refineOptions.language === "both" ? promptTemplates["lang_both"]?.instruction || "Provide both English and Hindi." : refineOptions.language === "en" ? promptTemplates["lang_en"]?.instruction || "Provide English only." : promptTemplates["lang_hi"]?.instruction || "Provide Hindi only."}
        ${getFormatPromptInstruction(
          refineOptions.format,
          refineOptions.bulletSymbol,
          promptTemplates["format_paragraph"]?.instruction,
          promptTemplates["format_bullets"]?.instruction,
        )}
        - Length: ${refineOptions.length === "short" ? promptTemplates["length_short"]?.instruction || "Very short and concise." : refineOptions.length === "medium" ? promptTemplates["length_medium"]?.instruction || "Medium length, balanced detail." : promptTemplates["length_long"]?.instruction || "Normal length, comprehensive."}
        ${refineOptions.lineLimit ? `- Strictly limit the summary to ${refineOptions.lineLimit} lines.` : ""}
        ${refineOptions.includeSentiment && promptTemplates["addon_sentiment"] ? promptTemplates["addon_sentiment"].instruction : ""}
        ${refineOptions.extractFigures && promptTemplates["addon_figures"] ? promptTemplates["addon_figures"].instruction : ""}
        ${refineOptions.addImpact && promptTemplates["addon_impact"] ? promptTemplates["addon_impact"].instruction : ""}
        ${refineOptions.generateTags && promptTemplates["addon_tags"] ? promptTemplates["addon_tags"].instruction : ""}
        ${refineInstructions ? `- Custom Focus: ${refineInstructions}` : ""}
        ${customAddOns
          .filter((a) => a.enabled)
          .map((a) => `- ${a.label}`)
          .join("\n")}
        
        Return the result in JSON format with:
        - 'summary_en': The refined English text (Must follow the FORMAT and LENGTH parameters above).
        - 'summary_hi': The refined Hindi text (Must be grammatically correct Devanagari, and MUST ALSO strictly follow the exact same FORMAT, LENGTH, AND BULLETING rules above!).
        
        Note: If images are provided, analyze them for data, charts, or text and incorporate the findings into the summaries.
      `;

      if (refineMode === "image") {
        const imagePrompt = `You are an expert market analyst assisting a graphic designer. Create a highly detailed, extremely professional prompt for an AI image generator. The image should perfectly summarize and illustrate the following market news in an infographic or illustrative style. Make sure it describes visual elements, charts (if any), colors, and tone. News: ${item.raw_text}`;

        // Use standard text Gemini to create the visual prompt
        const promptParams = await callGeminiWithFallback(imagePrompt);
        const generatedVisualPrompt = promptParams.text;

        // Generate the image using gemini-2.5-flash-image
        let imageUrl = "";
        let isPlaceholder = false;
        try {
          imageUrl = await callGeminiImageWithFallback(generatedVisualPrompt);
        } catch (imgError) {
          console.warn(
            "Image generation failed or is unsupported with standard keys, falling back to clean placeholder:",
            imgError,
          );
          isPlaceholder = true;
          const getCommodityPlaceholderImage = (categoryName: string) => {
            const cat = (categoryName || "").toLowerCase();
            if (
              cat.includes("oil") ||
              cat.includes("crude") ||
              cat.includes("energy") ||
              cat.includes("petroleum")
            ) {
              return "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80";
            }
            if (
              cat.includes("metal") ||
              cat.includes("steel") ||
              cat.includes("gold") ||
              cat.includes("copper") ||
              cat.includes("silver")
            ) {
              return "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=800&auto=format&fit=crop&q=80";
            }
            if (
              cat.includes("cotton") ||
              cat.includes("textile") ||
              cat.includes("fiber")
            ) {
              return "https://images.unsplash.com/photo-1598880940375-4a0dfc360113?w=800&auto=format&fit=crop&q=80";
            }
            if (
              cat.includes("grain") ||
              cat.includes("wheat") ||
              cat.includes("soy") ||
              cat.includes("corn") ||
              cat.includes("agriculture")
            ) {
              return "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=800&auto=format&fit=crop&q=80";
            }
            return "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80";
          };
          imageUrl = getCommodityPlaceholderImage(item.category);
        }

        const imageMarkdown = isPlaceholder
          ? `![Market Graphic](${imageUrl})\n\n*(Visual concept for news #${item.id} - Free Gemini API keys are limited to text-only summaries. Pro version required for live AI render.)*`
          : `![Generated Market Graphic](${imageUrl})\n\n*(Visual synthesis of news #${item.id} generated by Gemini)*`;

        const saveResponse = await fetch("/api/news", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: item.category_id,
            category_name: item.category,
            raw_text: item.raw_text,
            type: "refined",
            parent_id: item.id,
            summary_en: imageMarkdown,
            summary_hi: imageMarkdown,
            criteria_id: criteriaId,
          }),
        });

        if (saveResponse.ok) {
          const savedData = await saveResponse.json();
          await fetchFeed();
          setSelectedNews({
            ...item,
            id: savedData.id,
            type: "refined",
            parent_id: item.id,
            summary_en: imageMarkdown,
            summary_hi: imageMarkdown,
            criteria_id: criteriaId,
            is_copied: 0,
          });
        }
        return;
      }

      const imagesParts = item.images?.map((img) => ({
        data: img.split(",")[1] || img,
        mimeType: img.startsWith("data:")
          ? img.split(";")[0].split(":")[1]
          : "image/jpeg",
      }));

      const aiResponse = await callGeminiWithFallback(
        prompt,
        {
          type: Type.OBJECT,
          properties: {
            summary_en: { type: Type.STRING },
            summary_hi: { type: Type.STRING },
          },
          required: ["summary_en", "summary_hi"],
        },
        imagesParts,
      );

      const result = JSON.parse(aiResponse.text);

      const initialRefineState = {
        refineOptions: { ...refineOptions },
        refineInstructions,
        customAddOns: customAddOns.filter((a) => a.enabled).map((a) => a.label),
      };

      // Save as a NEW refined news item linked to the parent
      const saveResponse = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: item.category_id,
          category_name: item.category,
          raw_text: item.raw_text,
          type: "refined",
          parent_id: item.id,
          summary_en: result.summary_en,
          summary_hi: result.summary_hi,
          criteria_id: criteriaId,
          refine_options: JSON.stringify(initialRefineState),
          correction_history: JSON.stringify([]),
        }),
      });

      if (saveResponse.ok) {
        const savedData = await saveResponse.json();
        await fetchFeed(); // Refresh the list
        // Select the new refined item
        setSelectedNews({
          ...item,
          id: savedData.id,
          type: "refined",
          parent_id: item.id,
          summary_en: result.summary_en,
          summary_hi: result.summary_hi,
          criteria_id: criteriaId,
          refine_options: JSON.stringify(initialRefineState),
          correction_history: JSON.stringify([]),
          is_copied: 0,
        });
      }
    } catch (error: any) {
      console.error("Failed to refine news with AI:", error);
      const msg = error?.message || String(error);
      if (
        msg.includes("API key not valid") ||
        msg.includes("API_KEY_INVALID")
      ) {
        alert(
          "Your Gemini API key is missing or invalid. Please add a valid API key in the settings tab.",
        );
      } else {
        alert("Failed to refine news: " + msg);
      }
    } finally {
      setIsRefining(false);
    }
  };

  const handleRegenerateRefinement = async () => {
    if (!selectedNews || (!regenInstruction.trim() && correctionImages.length === 0)) return;
    setIsRegenerating(true);

    try {
      let state: any = null;
      if (selectedNews.refine_options) {
        try {
          state = JSON.parse(selectedNews.refine_options);
        } catch (e) {
          console.warn("Failed to parse refine_options:", e);
        }
      }
      if (!state) {
        state = {
          refineOptions: { ...refineOptions },
          refineInstructions: refineInstructions || "",
          customAddOns: customAddOns
            .filter((a) => a.enabled)
            .map((a) => a.label),
        };
      }

      let history: any[] = [];
      if (selectedNews.correction_history) {
        try {
          history = JSON.parse(selectedNews.correction_history);
          if (!Array.isArray(history)) {
            history = [];
          }
        } catch (e) {
          console.warn("Failed to parse correction_history:", e);
        }
      }

      const newHistoryItem = {
        text: regenInstruction.trim(),
        images: correctionImages,
        timestamp: new Date().toISOString(),
      };
      
      let updatedHistory = [...history, newHistoryItem];
      
      // Phase 2: "Image-to-Text" Archiving (Memory Sliding Window)
      // Active Window: Retain full images for the most recent 2 cycles
      const ACTIVE_WINDOW_SIZE = 2;
      updatedHistory = updatedHistory.map((item: any, index: number) => {
        if (index < updatedHistory.length - ACTIVE_WINDOW_SIZE) {
          if (item.images && item.images.length > 0) {
            return {
              ...item,
              images: [],
              archivedImageIndicator: true,
              archivedImageText: `[Archived visual instruction: User provided corrective feedback with ${item.images.length} attached reference image(s)]`
            };
          }
        }
        return item;
      });

      const historyFormatted = updatedHistory.map((h: any, i) => {
        if (typeof h === "string") {
          return `Step ${i + 1} correction: "${h}"`;
        }
        let stepText = `Step ${i + 1} correction: "${h.text || ""}"`;
        if (h.images && h.images.length > 0) {
          stepText += ` (with ${h.images.length} attached visual correction sample/sheet)`;
        } else if (h.archivedImageIndicator) {
          stepText += ` ${h.archivedImageText}`;
        }
        return stepText;
      }).join("\n");

      let prompt = `
        You are a senior commodity market analyst. 
        You need to RE-REFINE an already refined news item based on a sequence of ongoing corrective feedbacks.

        ORIGINAL RAW SOURCE MATERIAL:
        ${selectedNews.raw_text}

        PREVIOUS REFINED SUMMARY VERSION TO BE CORRECTED:
        English summary: ${selectedNews.summary_en || ""}
        Hindi summary: ${selectedNews.summary_hi || ""}

        ORIGINAL REFINEMENT OPTIONS & SELECTIONS USED:
        - Language options: ${state.refineOptions?.language || "both"}
        - Output Format: ${state.refineOptions?.format === "paragraph" ? "Cohesive paragraphs" : "Structured dash-bullet points"}
        - Length preference: ${state.refineOptions?.length || "Medium"}
        - Custom Focus: ${state.refineInstructions || "None"}
        ${state.customAddOns?.length > 0 ? `- Additional instructions: ${state.customAddOns.join("; ")}` : ""}

        ITERATIVE FEEDBACK & REVISION HISTORY:
        ${historyFormatted}
      `;

      if (regenInstruction.trim()) {
        prompt += `
        LATEST URGENT CORRECTIVE FEEDBACK TO APPLY:
        "${regenInstruction.trim()}"
        `;
      }

      if (correctionImages.length > 0) {
        prompt += `
        LATEST ATTACHED CORRECTIVE VISUAL FEEDBACK (IMAGES):
        The user has uploaded ${correctionImages.length} image(s) displaying visual guidelines, reference sheets, or correction samples. Analyze these attached image(s) carefully to extract visual instructions, charts, data, formatting examples, or manual corrections, and apply them comprehensively to update the summaries.
        `;
      }

      prompt += `
        INSTRUCTIONS FOR UPDATE:
        1. Analyze the user's past feedback rules and this newly uploaded feedback (visual/textual). Adjust the generation output of the targeted news items accordingly.
        2. Synthesize it together with all previous feedback and the original choices. The new text MUST replace the previous version but maintain the overall constraints.
        3. Keep the output incredibly clean, precise, and accurate to the raw source data and visual reference. Do not invent details.
        4. Output the result in clean JSON format with:
           - 'summary_en': Updated refined English text (Must strictly follow the previously used formatting, such as bullets if applicable).
           - 'summary_hi': Updated refined Hindi text (Native, grammatically correct Devanagari script, and MUST strictly follow the exact same formatting layout/bullets as English!).
      `;

      const activeCorrectionImagesParts = correctionImages.map((img) => ({
        data: img.split(",")[1] || img,
        mimeType: img.startsWith("data:")
          ? img.split(";")[0].split(":")[1]
          : "image/jpeg",
      }));

      const aiResponse = await callGeminiWithFallback(
        prompt,
        {
          type: Type.OBJECT,
          properties: {
            summary_en: { type: Type.STRING },
            summary_hi: { type: Type.STRING },
          },
          required: ["summary_en", "summary_hi"],
        },
        activeCorrectionImagesParts,
      );

      const result = JSON.parse(aiResponse.text);

      const patchResponse = await fetch(`/api/news/${selectedNews.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary_en: result.summary_en,
          summary_hi: result.summary_hi,
          refine_options: JSON.stringify(state),
          correction_history: JSON.stringify(updatedHistory),
        }),
      });

      if (patchResponse.ok) {
        setRegenInstruction("");
        setCorrectionImages([]);
        await fetchFeed();

        setSelectedNews((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            summary_en: result.summary_en,
            summary_hi: result.summary_hi,
            refine_options: JSON.stringify(state),
            correction_history: JSON.stringify(updatedHistory),
            is_copied: 0,
          };
        });
      } else {
        throw new Error("Failed to save updated news refinement.");
      }
    } catch (error: any) {
      console.error("Failed to regenerate news with AI:", error);
      alert(
        "Failed to regenerate refined news: " +
          (error?.message || String(error)),
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopy = async (
    type: "news" | "report",
    id: number,
    content: string,
    bypassCriteriaCheck: boolean = false,
  ) => {
    if (type === "news" && !bypassCriteriaCheck) {
      const item = newsFeed.find((n) => n.id === id);
      if (item && !item.criteria_id) {
        setCopyPendingItem({ id, content });
        return;
      }
    }
    try {
      // Helper to convert standard markdown to WhatsApp formatting
      const formatForWhatsApp = (text: string) => {
        let formatted = text
          .replace(/\*\*(.*?)\*\*/g, "*$1*") // Bold
          .replace(/__(.*?)__/g, "_$1_") // Italic
          .replace(/^### (.*$)/gm, "*$1*") // H3 as Bold
          .replace(/^## (.*$)/gm, "*$1*") // H2 as Bold
          .replace(/^# (.*$)/gm, "*$1*") // H1 as Bold
          .replace(/^- (.*$)/gm, "• $1") // Bullets
          .replace(/~~(.*?)~~/g, "~$1~") // Strikethrough
          .replace(/`([^`\n]+?)`/g, "```$1```"); // Monospace/Code block for WhatsApp

        // Normalize multiple consecutive blank lines (3 or more newlines become at most 2 newlines / 1 blank line)
        formatted = formatted.replace(/\n([ \t]*\n){2,}/g, "\n\n");

        // Collapse any blank line (or extra blank lines) immediately after a bold header line to a single newline
        formatted = formatted.replace(/^(\*[^*]+?\*\s*\n)\s*\n+/gm, "$1");

        return formatted;
      };

      const formattedContent = formatForWhatsApp(content);
      await navigator.clipboard.writeText(formattedContent);

      // Set a timestamp-backed dynamic ID to trigger click response and animation waves even on Nth clicks
      const pulseId = `${type}-${id}-${Date.now()}`;
      setJustCopiedId(pulseId);
      setTimeout(() => {
        setJustCopiedId((prev) => (prev === pulseId ? null : prev));
      }, 1000);

      const endpoint =
        type === "news" ? `/api/news/${id}` : `/api/reports/${id}/copied`;
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_copied: 1 }),
      });

      if (response.ok) {
        if (type === "news") {
          setNewsFeed((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, is_copied: 1 } : item,
            ),
          );
          if (selectedNews?.id === id) {
            setSelectedNews((prev) =>
              prev ? { ...prev, is_copied: 1 } : null,
            );
          }
        } else {
          setReportsList((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, is_copied: 1 } : item,
            ),
          );
          if (selectedReport?.id === id) {
            setSelectedReport((prev) =>
              prev ? { ...prev, is_copied: 1 } : null,
            );
          }
        }
      }
    } catch (err) {
      console.error("Failed to copy text or update status:", err);
    }
  };

  const fetchNewsForReport = useCallback(async () => {
    if (!activeCategoryId || viewMode !== "reports") return;
    setIsFetchingNewsForReport(true);
    try {
      const response = await fetch(
        `/api/news/${activeCategoryId}/period/${selectedReportType}`,
      );
      const data = await response.json();
      const news = Array.isArray(data) ? data : [];
      setNewsForReport(news);
      // Auto-select all by default when news are fetched
      setSelectedNewsIds(new Set(news.map((item) => item.id)));
    } catch (error) {
      console.error("Failed to fetch news for report:", error);
      setNewsForReport([]);
    } finally {
      setIsFetchingNewsForReport(false);
    }
  }, [activeCategoryId, selectedReportType, viewMode]);

  useEffect(() => {
    fetchNewsForReport();
  }, [fetchNewsForReport]);

  const toggleNewsSelection = (id: number) => {
    setSelectedNewsIds((prev) => {
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
    setSelectedNewsIds(new Set(newsForReport.map((item) => item.id)));
  };

  const clearAllNews = () => {
    setSelectedNewsIds(new Set());
  };

  const handleToggleStar = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredNewsIds((prev) => {
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

    setNewsFeed((prev) =>
      prev.map((item) =>
        item.id === isEditingNews.id
          ? { ...item, raw_text: updatedContent, images: updatedImages }
          : item,
      ),
    );

    if (selectedNews?.id === isEditingNews.id) {
      setSelectedNews({
        ...selectedNews,
        raw_text: updatedContent,
        images: updatedImages,
      });
    }

    setIsEditingNews(null);
  };

  const processImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;

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

      setEditingNewsImages((prev) => [...prev, fullBase64]);
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
    files.forEach((file) => {
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
            setInputImages((prev) => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleInputImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          setInputImages((prev) => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const compressImage = (base64Str: string, maxWidth: number = 1024, maxHeight: number = 1024): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const handleCorrectionImageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCorrectionImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            const compressed = await compressImage(reader.result as string);
            setCorrectionImages((prev) => [...prev, compressed]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleCorrectionImagePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            const compressed = await compressImage(reader.result as string);
            setCorrectionImages((prev) => [...prev, compressed]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleCorrectionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = async () => {
          const compressed = await compressImage(reader.result as string);
          setCorrectionImages((prev) => [...prev, compressed]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleToggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNewsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandNews = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNewsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGenerateReport = async (type: "daily" | "weekly" | "monthly") => {
    if (!activeCategoryId) return;

    const selectedItems = newsForReport.filter((item) =>
      selectedNewsIds.has(item.id),
    );
    if (selectedItems.length === 0) {
      alert("Please select at least one news item to generate a report.");
      return;
    }

    setIsGeneratingReport(true);
    try {
      let content_en = "";
      let content_hi = "";

      const optionsPrompt = `
        FORMATTING:
        ${getHeadlinePromptInstruction(
          reportOptions.withHeadline,
          reportOptions.headlineOption,
          reportOptions.headlineSymbol,
          promptTemplates["headline_format"]?.instruction,
        )}
        ${reportOptions.withHeader ? "- Include a professional report header with current date and market category." : ""}
        ${reportOptions.withFooter ? "- Include a professional report footer with disclaimers and contact information." : ""}
        - Language: ${reportOptions.language === "both" ? promptTemplates["lang_both"]?.instruction || "Provide both English and Hindi." : reportOptions.language === "en" ? promptTemplates["lang_en"]?.instruction || "Provide English only." : promptTemplates["lang_hi"]?.instruction || "Provide Hindi only."}
        ${getFormatPromptInstruction(
          reportOptions.format,
          reportOptions.bulletSymbol,
          promptTemplates["format_paragraph"]?.instruction,
          promptTemplates["format_bullets"]?.instruction,
        )}
        - Length: ${reportOptions.length === "short" ? promptTemplates["length_short"]?.instruction || "Very short and concise." : reportOptions.length === "medium" ? promptTemplates["length_medium"]?.instruction || "Medium length, balanced detail." : promptTemplates["length_long"]?.instruction || "Normal length, comprehensive."}
        ${reportOptions.lineLimit ? `- Limit to approximately ${reportOptions.lineLimit} lines` : ""}
        
        INTELLIGENCE ADD-ONS:
        ${reportOptions.includeSentiment && promptTemplates["addon_sentiment"] ? promptTemplates["addon_sentiment"].instruction : ""}
        ${reportOptions.extractFigures && promptTemplates["addon_figures"] ? promptTemplates["addon_figures"].instruction : ""}
        ${reportOptions.addImpact && promptTemplates["addon_impact"] ? promptTemplates["addon_impact"].instruction : ""}
        ${reportOptions.generateTags && promptTemplates["addon_tags"] ? promptTemplates["addon_tags"].instruction : ""}
        ${reportInstructions ? `- Custom Focus: ${reportInstructions}` : ""}
        ${customAddOns
          .filter((a) => a.enabled)
          .map((a) => `- ${a.label}`)
          .join("\n")}
      `;

      if (reportSource === "master") {
        // 3-Step Synthesis
        // Step 1: Raw Summary
        const rawContext = selectedItems
          .map((item) => `- ${item.raw_text}`)
          .join("\n");
        const rawPrompt = `Summarize these RAW news items for ${activeCategory} market report: \n${rawContext}`;
        const rawRes = await callGeminiWithFallback(rawPrompt);
        const rawSummary = rawRes.text;

        // Step 2: Refined Summary
        const refinedContext = selectedItems
          .map((item) => `- ${item.summary_en || item.raw_text}`)
          .join("\n");
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
          required: ["content_en", "content_hi"],
        });
        const masterResult = JSON.parse(masterRes.text);
        content_en = masterResult.content_en;
        content_hi = masterResult.content_hi;
      } else {
        // Standard Generation (Raw or Refined)
        const context = selectedItems
          .map((item) =>
            reportSource === "raw"
              ? `- ${item.raw_text}`
              : `- ${item.summary_en || item.raw_text}`,
          )
          .join("\n");

        const prompt = `
          Generate a comprehensive ${type} closing summary report for the ${activeCategory} market.
          Source Data: ${reportSource === "raw" ? "Raw News" : "Refined Intelligence"}
          
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
          required: ["content_en", "content_hi"],
        });
        const result = JSON.parse(aiResponse.text);
        content_en = result.content_en;
        content_hi = result.content_hi;
      }

      // 3. Save report to database
      let targetId = activeCategoryId;
      let targetName = activeCategory;
      const cat = categories.find((c) => c.id === activeCategoryId);
      if (cat && !cat.parent_id) {
        const sub = categories.find((c) => c.parent_id === activeCategoryId);
        if (sub) {
          targetId = sub.id;
          targetName = sub.name;
        }
      }

      const saveResponse = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: targetId,
          category_name: targetName,
          type,
          content_en,
          content_hi,
          start_date: new Date().toISOString(),
          end_date: new Date().toISOString(),
          source_news_ids: Array.from(selectedNewsIds),
          source_mode: reportSource,
        }),
      });

      if (saveResponse.ok) {
        await fetchReports();
        const savedData = await saveResponse.json();
        // Automatically select the new report
        setSelectedReport({
          id: savedData.id,
          category_id: targetId,
          category: targetName,
          type,
          content_en,
          content_hi,
          is_copied: 0,
          start_date: new Date().toISOString(),
          end_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error("Failed to generate report:", error);
      const msg = error?.message || String(error);
      if (
        msg.includes("API key not valid") ||
        msg.includes("API_KEY_INVALID")
      ) {
        alert(
          "Your Gemini API key is missing or invalid. Please add a valid API key in the settings tab.",
        );
      } else {
        alert("Failed to generate report: " + msg);
      }
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleMoveToTrash = async (id: number, type: "news" | "report") => {
    try {
      const endpoint =
        type === "news" ? `/api/news/${id}/trash` : `/api/reports/${id}/trash`;
      const response = await fetch(endpoint, { method: "PATCH" });
      if (response.ok) {
        if (type === "news") {
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

  const handleRestore = async (id: number, type: "news" | "report") => {
    try {
      const endpoint =
        type === "news"
          ? `/api/news/${id}/restore`
          : `/api/reports/${id}/restore`;
      const response = await fetch(endpoint, { method: "PATCH" });
      if (response.ok) {
        fetchTrash();
      }
    } catch (error) {
      console.error(`Failed to restore ${type}:`, error);
    }
  };

  const handlePermanentDelete = async (id: number, type: "news" | "report") => {
    if (!confirm("Are you sure you want to permanently delete this item?"))
      return;
    try {
      const endpoint =
        type === "news" ? `/api/news/${id}` : `/api/reports/${id}`;
      const response = await fetch(endpoint, { method: "DELETE" });
      if (response.ok) {
        fetchTrash();
      }
    } catch (error) {
      console.error(`Failed to permanently delete ${type}:`, error);
    }
  };

  const toggleMaximize = (panel: "left" | "right") => {
    if (maximizedPanel === panel) {
      setMaximizedPanel(null);
      setLeftWidth(lastWidth);
    } else {
      setLastWidth(leftWidth);
      setMaximizedPanel(panel);
      setLeftWidth(panel === "left" ? 100 : 0);
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
        const newWidth =
          ((e.clientX - containerRect.left) / containerRect.width) * 100;

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
    [isResizing, isResizingSidebar],
  );

  useEffect(() => {
    if (isResizing || isResizingSidebar) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
      window.addEventListener("mouseup", () => setIsResizingSidebar(false));
    } else {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, isResizingSidebar, resize, stopResizing]);

  const parseSafeDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    if (dateStr.includes(" ") && !dateStr.includes("T")) {
      return new Date(dateStr.replace(" ", "T") + "Z");
    }
    return new Date(dateStr);
  };

  const groupNewsByDate = (news: NewsItem[]) => {
    const groups: Record<string, NewsItem[]> = {};

    news.forEach((item) => {
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
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const dateFormatted = date
      .toLocaleDateString("en-US", dateOptions)
      .toUpperCase();

    if (date.toDateString() === today.toDateString()) {
      return `TODAY — ${dateFormatted}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `YESTERDAY — ${dateFormatted}`;
    } else {
      const dayOptions: Intl.DateTimeFormatOptions = { weekday: "long" };
      const dayName = date
        .toLocaleDateString("en-US", dayOptions)
        .toUpperCase();
      return `${dayName} — ${dateFormatted}`;
    }
  };

  const filteredNews = newsFeed.filter((item) => {
    const typeMatch = feedFilter === "all" || item.type === feedFilter;
    if (!typeMatch) return false;

    if (criteriaFilter !== "all") {
      if (item.criteria_id !== criteriaFilter) return false;
    }

    const itemDate = parseSafeDate(item.created_at);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (timeFilter === "today") {
      const start = startOfDay(now);
      return itemDate >= start;
    }
    if (timeFilter === "yesterday") {
      const startOfToday = startOfDay(now);
      const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
      return itemDate >= startOfYesterday && itemDate < startOfToday;
    }
    if (timeFilter === "1week") return diffDays <= 7;
    if (timeFilter === "2week") return diffDays <= 14;
    if (timeFilter === "1month") return diffDays <= 30;
    if (timeFilter === "3month") return diffDays <= 90;
    if (timeFilter === "custom" && customDateRange?.from) {
      const from = startOfDay(customDateRange.from);
      const to = customDateRange.to
        ? endOfDay(customDateRange.to)
        : endOfDay(customDateRange.from);
      return isWithinInterval(itemDate, { start: from, end: to });
    }

    return true;
  });

  const newsGroups = groupNewsByDate(filteredNews);
  const sortedDateStrings = Object.keys(newsGroups).sort((a, b) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });

  // Calculate disabled dates for calendar
  const oldestNewsDate =
    newsFeed.length > 0
      ? new Date(
          Math.min(
            ...newsFeed.map((item) => parseSafeDate(item.created_at).getTime()),
          ),
        )
      : undefined;
  const disabledDays = oldestNewsDate
    ? [{ before: startOfDay(oldestNewsDate) }, { after: endOfDay(new Date()) }]
    : [];

  const renderNewsInputArea = (location: "left" | "top") => {
    if (inputPlacement !== location) return null;
    return (
      <div 
        className={
          location === "left" 
            ? "mt-auto px-2 pb-2 shrink-0" 
            : "px-6 pt-5 pb-3 border-b border-gray-200/50 dark:border-[#2d2f31]/50 bg-[#F7F5F2] dark:bg-[#1a1c1e] shrink-0 z-10 animate-in fade-in slide-in-from-top-2 duration-300"
        }
      >
        <div
          className={`relative border-2 border-[#009f75] rounded-xl shadow-sm flex flex-col overflow-hidden focus-within:ring-2 focus-within:ring-[#009f75] focus-within:ring-opacity-50 transition-all ${
            theme === "dark" ? "bg-[#232527]" : "bg-white"
          }`}
        >
          {inputImages.length > 0 && (
            <div className="p-2 flex flex-wrap gap-1.5 border-b border-gray-100 bg-gray-50/50 max-h-24 overflow-y-auto">
              {inputImages.map((img, idx) => (
                <div
                  key={idx}
                  className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 group bg-white shadow-xs"
                >
                  <img
                    src={img}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() =>
                      setInputImages((prev) =>
                        prev.filter((_, i) => i !== idx),
                      )
                    }
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
            style={{ height: `${location === "left" ? textareaHeightLeft : textareaHeightTop}px` }}
            className={`w-full p-3 resize-none border-none bg-transparent text-sm outline-none font-medium custom-scrollbar ${
              theme === "dark"
                ? "text-gray-200 placeholder-gray-500"
                : "text-gray-900 placeholder-gray-400"
            }`}
            placeholder={
              activeCategory
                ? `Paste ${activeCategory} news...`
                : "Raw input..."
            }
          />
          <div
            className={`flex justify-between items-center px-3 py-2 border-t transition-colors ${
              theme === "dark"
                ? "bg-[#1e2022] border-[#2d2f31]"
                : "bg-gray-50 border-gray-100"
            }`}
          >
            <div className="flex items-center space-x-2">
              <select
                value={demoDaysAgo}
                onChange={(e) =>
                  setDemoDaysAgo(parseInt(e.target.value))
                }
                className="bg-transparent text-[10px] font-bold text-[#009f75] outline-none cursor-pointer pr-1"
                title="Days Ago"
              >
                {[...Array(31)].map((_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? "Today" : i + "d ago"}
                  </option>
                ))}
              </select>
              <div className="w-[1px] h-3 bg-gray-300" />
              <input
                type="file"
                id={`main-image-upload-${location}`}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleInputImageUpload}
              />
              <button
                onClick={() =>
                  document
                    .getElementById(`main-image-upload-${location}`)
                    ?.click()
                }
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
                className={`p-1 rounded text-gray-400 hover:text-[#00df95] transition-colors disabled:opacity-50 ${
                  theme === "dark" ? "hover:bg-[#009f75]/10" : "hover:bg-[#ebf5f1]"
                }`}
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
                {isProcessing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span>Add</span>
                )}
              </button>
            </div>
          </div>
          
          {/* Interactive resize lower boundary handle */}
          <div
            onMouseDown={(e) => handleInputAreaResizeStart(e, location)}
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-30 hover:bg-[#009f75]/30 active:bg-[#009f75]/50 transition-colors"
            title="Drag lower boundary to resize"
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        className={`flex flex-col h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${
          theme === "dark"
            ? "bg-[#1a1c1e] text-gray-200"
            : "bg-[#f4f5f7] text-gray-800"
        }`}
      >
        {/* --- Horizontal Top Bar --- */}
        <div className="flex h-12 w-full items-center bg-[#009f75] px-4 shadow-[0_4px_10px_rgba(0,0,0,0.1)] border-b border-white/10 z-30 shrink-0 select-none">
          <div className="flex items-center space-x-1 h-full w-full">
            {/* News Header Label (Single mode now) */}
            <div className="flex items-center h-full px-5 text-xs font-black uppercase tracking-wider text-white">
              <div className="flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span>News - (Daily-Weekly-Monthly)</span>
              </div>
            </div>
          </div>
        </div>

        {/* --- Main Row Container containing sidebar, main panels, etc. --- */}
        <div className="flex flex-1 flex-row overflow-hidden w-full h-full relative">
          <>
              {/* --- Utility Vertical Bar --- */}
              <div className="flex w-16 flex-col items-center justify-between bg-[#009f75] py-4 shadow-[4px_0_10px_rgba(0,0,0,0.1)] z-30 shrink-0">
                <div className="flex flex-col items-center space-y-3 w-full px-2 relative">
                  {/* Target / AI Refinement Custom Focus Toggle Button */}
                  <button
                    onClick={() => {
                      setIsIntelligenceInstructionsExpanded(
                        !isIntelligenceInstructionsExpanded,
                      );
                      if (!isIntelligenceInstructionsExpanded) {
                        setIsSidebarOpen(true);
                      }
                    }}
                    className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                      isIntelligenceInstructionsExpanded
                        ? "bg-white text-amber-605 shadow-sm"
                        : "text-white hover:bg-white/20"
                    }`}
                    title="AI Refinement Focus Presets"
                    id="sidebar-refinement-toggle-btn"
                  >
                    <Target
                      size={16}
                      strokeWidth={2.5}
                      className={
                        isIntelligenceInstructionsExpanded
                          ? "animate-pulse text-amber-500"
                          : "text-white"
                      }
                    />
                  </button>

                  <button
                    onClick={() => setInputPlacement(prev => prev === "left" ? "top" : "left")}
                    className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                      inputPlacement === "top"
                        ? "bg-white text-[#009f75] shadow-sm"
                        : "text-white hover:bg-white/20"
                    }`}
                    title={inputPlacement === "left" ? "Move input box to top of feed" : "Move input box to bottom of sidebar"}
                    id="input-placement-toggle-btn"
                  >
                    <ArrowUpDown size={16} strokeWidth={2.5} />
                  </button>

                  <div
                    className="relative flex flex-col items-center w-full"
                    ref={zoomMenuRef}
                  >
                    <button
                      onClick={() => setIsZoomMenuExpanded(!isZoomMenuExpanded)}
                      className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                        isZoomMenuExpanded
                          ? "bg-white/30"
                          : "text-white hover:bg-white/20"
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
                          className="absolute left-[48px] top-1/2 -translate-y-1/2 flex items-center bg-[#009f75] p-1.5 rounded-r-xl shadow-[8px_4px_20px_rgba(0,0,0,0.2)] border border-white/20 border-l-0 z-50 origin-left"
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

                  <div
                    className="relative flex flex-col items-center w-full"
                    ref={languageMenuRef}
                  >
                    <button
                      onClick={() =>
                        setIsLanguageMenuExpanded(!isLanguageMenuExpanded)
                      }
                      className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                        isLanguageMenuExpanded
                          ? "bg-white text-[#009f75] shadow-sm"
                          : "text-white hover:bg-white/20"
                      }`}
                      title="Language Selection"
                    >
                      <span className="text-[10px] font-black tracking-wide truncate px-0.5 uppercase leading-none">
                        {refineOptions.language === "both"
                          ? "BOTH"
                          : refineOptions.language.toUpperCase()}
                      </span>
                    </button>

                    <AnimatePresence>
                      {isLanguageMenuExpanded && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, x: -5 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95, x: -5 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="language-dropdown absolute left-[48px] top-[-10px] flex flex-col bg-white dark:bg-[#1f2022] p-3 rounded-2xl shadow-[8px_4px_30px_rgba(0,0,0,0.15)] border border-gray-150 dark:border-gray-800 z-50 origin-left w-56 text-left"
                        >
                          <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">
                            Language Selection
                          </div>
                          <div className="space-y-1">
                            {[
                              { id: "en", label: "English Only" },
                              { id: "hi", label: "Hindi Only" },
                              { id: "both", label: "Both Languages" },
                            ].map((opt) => {
                              const isSelected = refineOptions.language === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRefineOptions((prev) => ({
                                      ...prev,
                                      language: opt.id as any,
                                    }));
                                    setReportOptions((prev) => ({
                                      ...prev,
                                      language: opt.id as any,
                                    }));
                                    setIsLanguageMenuExpanded(false);
                                  }}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold tracking-normal transition-all flex items-center justify-between cursor-pointer ${
                                    isSelected
                                      ? "bg-[#009f75]/10 text-[#009f75]"
                                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {isSelected && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-[#009f75]" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {refineOptions.language === "both" && (
                    <div
                      className="relative flex flex-col items-center w-full animate-in fade-in zoom-in duration-200"
                      ref={orderMenuRef}
                    >
                      <button
                        onClick={() =>
                          setIsOrderMenuExpanded(!isOrderMenuExpanded)
                        }
                        className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                          isOrderMenuExpanded
                            ? "bg-white text-[#009f75] shadow-sm"
                            : "text-white hover:bg-white/20"
                        }`}
                        title="Language Sequence Selector"
                      >
                        <span className="text-[10px] font-black tracking-wide truncate px-0.5 uppercase leading-none">
                          {refineOptions.order === "hi-en" ? "HI-EN" : "EN-HI"}
                        </span>
                      </button>

                      <AnimatePresence>
                        {isOrderMenuExpanded && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, x: -5 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95, x: -5 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="order-dropdown absolute left-[48px] top-[-10px] flex flex-col bg-white dark:bg-[#1f2022] p-3 rounded-2xl shadow-[8px_4px_30px_rgba(0,0,0,0.15)] border border-gray-150 dark:border-gray-800 z-50 origin-left w-56 text-left"
                          >
                            <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">
                              Language Sequence
                            </div>
                            <div className="space-y-1">
                              {[
                                { id: "hi-en", label: "Hindi - English (HI-EN)" },
                                { id: "en-hi", label: "English - Hindi (EN-HI)" },
                              ].map((opt) => {
                                const isSelected = refineOptions.order === opt.id;
                                return (
                                  <button
                                    key={opt.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRefineOptions((prev) => ({
                                        ...prev,
                                        order: opt.id as any,
                                      }));
                                      setReportOptions((prev) => ({
                                        ...prev,
                                        order: opt.id as any,
                                      }));
                                      setIsOrderMenuExpanded(false);
                                    }}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold tracking-normal transition-all flex items-center justify-between cursor-pointer ${
                                      isSelected
                                        ? "bg-[#009f75]/10 text-[#009f75]"
                                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    }`}
                                  >
                                    <span>{opt.label}</span>
                                    {isSelected && (
                                      <div className="h-1.5 w-1.5 rounded-full bg-[#009f75]" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <div
                    className="relative flex flex-col items-center w-full"
                    ref={formatMenuRef}
                  >
                    <button
                      onClick={() =>
                        setIsFormatMenuExpanded(!isFormatMenuExpanded)
                      }
                      className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                        isFormatMenuExpanded ||
                        refineOptions.format !== "custom_symbol" ||
                        refineOptions.bulletSymbol !== "•"
                          ? "bg-white text-[#009f75] shadow-sm"
                          : "text-white hover:bg-white/20"
                      }`}
                      title="Format Selection"
                    >
                      {refineOptions.format === "paragraph" ? (
                        <AlignLeft size={16} strokeWidth={2} />
                      ) : refineOptions.format === "custom_symbol" ? (
                        <span className="text-[13px]">
                          {refineOptions.bulletSymbol}
                        </span>
                      ) : refineOptions.format === "ai_symbol" ? (
                        <span className="text-[11px] font-black tracking-tighter">
                          B✨
                        </span>
                      ) : (
                        <List size={16} strokeWidth={2} />
                      )}
                    </button>

                    <AnimatePresence>
                      {isFormatMenuExpanded && (
                        <motion.div
                          ref={formatDropdownRef}
                          style={{ top: formatDropdownTop }}
                          initial={{ opacity: 0, scale: 0.95, x: -5 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95, x: -5 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="format-dropdown absolute left-[48px] flex flex-col bg-white dark:bg-[#1f2022] p-3 rounded-2xl shadow-[8px_4px_30px_rgba(0,0,0,0.15)] border border-gray-150 dark:border-gray-800 z-50 origin-left w-56 text-left"
                        >
                          <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">
                            Bullet Format Selection
                          </div>
                          <div className="space-y-1">
                            {[
                              { id: "paragraph", label: "Cohesive Paragraph" },
                              {
                                id: "ai_symbol",
                                label: "Bullets with AI Symbols",
                              },
                              {
                                id: "custom_symbol",
                                label: "Bullets with Custom Symbol",
                              },
                            ].map((opt) => {
                              const isSelected =
                                refineOptions.format === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRefineOptions((prev) => ({
                                      ...prev,
                                      format: opt.id as any,
                                    }));
                                    setReportOptions((prev) => ({
                                      ...prev,
                                      format: opt.id as any,
                                    }));
                                    if (opt.id !== "custom_symbol") {
                                      setIsFormatMenuExpanded(false);
                                    }
                                  }}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold tracking-normal transition-all flex items-center justify-between cursor-pointer ${
                                    isSelected
                                      ? "bg-[#009f75]/10 text-[#009f75]"
                                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {isSelected && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-[#009f75]" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {refineOptions.format === "custom_symbol" && (
                            <div className="mt-3 pt-3 border-t border-gray-150 dark:border-gray-800 animate-in slide-in-from-top-1 duration-200">
                              <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5 px-1 text-xs">
                                Choose Bullet Symbol
                              </div>
                              <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto pr-1">
                                {[
                                  {
                                    char: "•",
                                    label: "Standard Bullet",
                                    activeColor: "ring-2 ring-gray-400/50",
                                  },
                                  {
                                    char: "🟢",
                                    label: "Green Circle",
                                    activeColor: "ring-2 ring-emerald-500/50",
                                  },
                                  {
                                    char: "🔴",
                                    label: "Red Circle",
                                    activeColor: "ring-2 ring-rose-500/50",
                                  },
                                  {
                                    char: "🔵",
                                    label: "Blue Circle",
                                    activeColor: "ring-2 ring-blue-500/50",
                                  },
                                  {
                                    char: "🟡",
                                    label: "Yellow Circle",
                                    activeColor: "ring-2 ring-yellow-500/50",
                                  },
                                  {
                                    char: "🟠",
                                    label: "Orange Circle",
                                    activeColor: "ring-2 ring-orange-500/50",
                                  },
                                  {
                                    char: "🟣",
                                    label: "Purple Circle",
                                    activeColor: "ring-2 ring-purple-500/50",
                                  },
                                  {
                                    char: "⚫",
                                    label: "Black Circle",
                                    activeColor: "ring-2 ring-gray-800/50",
                                  },
                                  {
                                    char: "⚪",
                                    label: "White Circle",
                                    activeColor: "ring-2 ring-gray-200/50",
                                  },
                                  {
                                    char: "🔺",
                                    label: "Up Triangle / Gain",
                                    activeColor: "ring-2 ring-emerald-500/50",
                                  },
                                  {
                                    char: "🔻",
                                    label: "Down Triangle / Loss",
                                    activeColor: "ring-2 ring-rose-500/50",
                                  },
                                  {
                                    char: "🔸",
                                    label: "Small Orange Diamond",
                                    activeColor: "ring-2 ring-amber-500/50",
                                  },
                                  {
                                    char: "🔹",
                                    label: "Small Blue Diamond",
                                    activeColor: "ring-2 ring-blue-500/50",
                                  },
                                  {
                                    char: "🔶",
                                    label: "Orange Diamond",
                                    activeColor: "ring-2 ring-amber-500/50",
                                  },
                                  {
                                    char: "🔷",
                                    label: "Blue Diamond",
                                    activeColor: "ring-2 ring-blue-400/50",
                                  },
                                  {
                                    char: "⭐",
                                    label: "Critical / Featured",
                                    activeColor: "ring-2 ring-yellow-400/50",
                                  },
                                  {
                                    char: "📈",
                                    label: "Market Gain / Trend",
                                    activeColor: "ring-2 ring-emerald-500/50",
                                  },
                                  {
                                    char: "📉",
                                    label: "Market Loss / Trend",
                                    activeColor: "ring-2 ring-rose-500/50",
                                  },
                                  {
                                    char: "📌",
                                    label: "Pin Takeaway",
                                    activeColor: "ring-2 ring-rose-500/50",
                                  },
                                  {
                                    char: "⚡",
                                    label: "High Impact News",
                                    activeColor: "ring-2 ring-amber-400/50",
                                  },
                                  {
                                    char: "✅",
                                    label: "Confirmed / Accurate",
                                    activeColor: "ring-2 ring-emerald-500/50",
                                  },
                                  {
                                    char: "🛢️",
                                    label: "Oil / Energy sector",
                                    activeColor: "ring-2 ring-slate-800/50",
                                  },
                                  {
                                    char: "🌾",
                                    label: "Agriculture / Commodities",
                                    activeColor: "ring-2 ring-amber-600/50",
                                  },
                                  {
                                    char: "💼",
                                    label: "Business / Trade",
                                    activeColor: "ring-2 ring-slate-600/50",
                                  },
                                  {
                                    char: "🪙",
                                    label: "Coin / Currency",
                                    activeColor: "ring-2 ring-yellow-500/50",
                                  },
                                ].map((symbolItem) => {
                                  const isSymbolSelected =
                                    refineOptions.bulletSymbol ===
                                    symbolItem.char;
                                  return (
                                    <button
                                      key={symbolItem.char}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRefineOptions((prev) => ({
                                          ...prev,
                                          bulletSymbol: symbolItem.char,
                                        }));
                                        setReportOptions((prev) => ({
                                          ...prev,
                                          bulletSymbol: symbolItem.char,
                                        }));
                                        setIsFormatMenuExpanded(false);
                                      }}
                                      className={`aspect-square flex items-center justify-center p-1 rounded-xl bg-gray-50 dark:bg-gray-800/20 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm cursor-pointer ${
                                        isSymbolSelected
                                          ? `${symbolItem.activeColor} scale-110 bg-white dark:bg-gray-700 shadow-sm`
                                          : "opacity-80 hover:opacity-100"
                                      }`}
                                      title={symbolItem.label}
                                    >
                                      <span>{symbolItem.char}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div
                    className="relative flex flex-col items-center w-full"
                    ref={headlineMenuRef}
                  >
                    <button
                      onClick={() => {
                        setIsHeadlineMenuExpanded(!isHeadlineMenuExpanded);
                      }}
                      className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                        isHeadlineMenuExpanded || refineOptions.withHeadline
                          ? "bg-white text-[#009f75] shadow-sm"
                          : "text-white hover:bg-white/20"
                      }`}
                      title="Toggle Headline"
                    >
                      <span className="font-extrabold text-[12px] flex items-center justify-center">
                        {refineOptions.headlineOption === "custom_symbol" ? (
                          <span className="text-[11px] font-bold tracking-tighter flex items-center justify-center gap-0.5">
                            <span>H</span>
                            <span className="text-[11px] font-semibold leading-none">
                              {refineOptions.headlineSymbol}
                            </span>
                          </span>
                        ) : refineOptions.headlineOption === "ai_symbol" ? (
                          <span className="text-[11px] font-black tracking-tighter">
                            H✨
                          </span>
                        ) : (
                          "H"
                        )}
                      </span>
                    </button>

                    <AnimatePresence>
                      {isHeadlineMenuExpanded && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, x: -5, y: -10 }}
                          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, x: -5, y: -10 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          ref={headlineDropdownRef}
                          style={{ top: headlineDropdownTop }}
                          className="headline-dropdown absolute left-[48px] flex flex-col bg-white dark:bg-[#1f2022] p-3 rounded-2xl shadow-[8px_4px_30px_rgba(0,0,0,0.15)] border border-gray-150 dark:border-gray-800 z-50 origin-left w-56 text-left"
                        >
                          <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">
                            Headline Selection
                          </div>
                          <div className="space-y-1">
                            {[
                              { id: "none", label: "No Headline" },
                              { id: "standard", label: "With Headline" },
                              {
                                id: "ai_symbol",
                                label: "Headline with AI defined symbol",
                              },
                              {
                                id: "custom_symbol",
                                label: "Headline with Custom Symbol",
                              },
                            ].map((opt) => {
                              const isSelected =
                                refineOptions.headlineOption === opt.id ||
                                (!refineOptions.headlineOption &&
                                  opt.id ===
                                    (refineOptions.withHeadline
                                      ? "standard"
                                      : "none"));
                              return (
                                <button
                                  key={opt.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRefineOptions((prev) => ({
                                      ...prev,
                                      headlineOption: opt.id as any,
                                      withHeadline: opt.id !== "none",
                                    }));
                                    setReportOptions((prev) => ({
                                      ...prev,
                                      headlineOption: opt.id as any,
                                      withHeadline: opt.id !== "none",
                                    }));
                                    if (opt.id !== "custom_symbol") {
                                      setIsHeadlineMenuExpanded(false);
                                    }
                                  }}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold tracking-normal transition-all flex items-center justify-between cursor-pointer ${
                                    isSelected
                                      ? "bg-[#009f75]/10 text-[#009f75]"
                                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {isSelected && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-[#009f75]" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {refineOptions.headlineOption === "custom_symbol" && (
                            <div className="mt-3 pt-3 border-t border-gray-150 dark:border-gray-800 animate-in slide-in-from-top-1 duration-200">
                              <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5 px-1 text-xs">
                                Choose Custom Symbol
                              </div>
                              <div className="grid grid-cols-5 gap-1.5">
                                {[
                                  {
                                    char: "🟤",
                                    label: "Brown Circle",
                                    activeColor: "ring-2 ring-[#a16244]/50",
                                  },
                                  {
                                    char: "🟢",
                                    label: "Green Circle",
                                    activeColor: "ring-2 ring-emerald-500/50",
                                  },
                                  {
                                    char: "🔴",
                                    label: "Red Circle",
                                    activeColor: "ring-2 ring-rose-500/50",
                                  },
                                  {
                                    char: "🔵",
                                    label: "Blue Circle",
                                    activeColor: "ring-2 ring-blue-500/50",
                                  },
                                  {
                                    char: "🟡",
                                    label: "Yellow Circle",
                                    activeColor: "ring-2 ring-yellow-500/50",
                                  },
                                  {
                                    char: "🔺",
                                    label: "Up Triangle / Gain",
                                    activeColor: "ring-2 ring-emerald-500/50",
                                  },
                                  {
                                    char: "🔻",
                                    label: "Down Triangle / Loss",
                                    activeColor: "ring-2 ring-rose-500/50",
                                  },
                                  {
                                    char: "🔶",
                                    label: "Orange Diamond",
                                    activeColor: "ring-2 ring-amber-500/50",
                                  },
                                  {
                                    char: "🔷",
                                    label: "Blue Diamond",
                                    activeColor: "ring-2 ring-blue-400/50",
                                  },
                                  {
                                    char: "⭐",
                                    label: "Critical / Featured",
                                    activeColor: "ring-2 ring-yellow-400/50",
                                  },
                                  {
                                    char: "📈",
                                    label: "Market Gain / Trend",
                                    activeColor: "ring-2 ring-emerald-500/50",
                                  },
                                  {
                                    char: "📉",
                                    label: "Market Loss / Trend",
                                    activeColor: "ring-2 ring-rose-500/50",
                                  },
                                  {
                                    char: "📢",
                                    label: "Announcement",
                                    activeColor: "ring-2 ring-cyan-500/50",
                                  },
                                  {
                                    char: "⚡",
                                    label: "High Impact News",
                                    activeColor: "ring-2 ring-amber-400/50",
                                  },
                                  {
                                    char: "🏛️",
                                    label: "Central Bank / Policy",
                                    activeColor: "ring-2 ring-indigo-500/50",
                                  },
                                  {
                                    char: "💼",
                                    label: "Business / Trade",
                                    activeColor: "ring-2 ring-slate-600/50",
                                  },
                                  {
                                    char: "🛢️",
                                    label: "Oil / Energy sector",
                                    activeColor: "ring-2 ring-slate-800/50",
                                  },
                                  {
                                    char: "🌾",
                                    label: "Agriculture / Commodities",
                                    activeColor: "ring-2 ring-amber-600/50",
                                  },
                                  {
                                    char: "🔩",
                                    label: "Metals & Industrial",
                                    activeColor: "ring-2 ring-zinc-500/50",
                                  },
                                  {
                                    char: "🪙",
                                    label: "Currency / Forex",
                                    activeColor: "ring-2 ring-yellow-500/50",
                                  },
                                ].map((symbolItem) => {
                                  const isSymbolSelected =
                                    refineOptions.headlineSymbol ===
                                    symbolItem.char;
                                  return (
                                    <button
                                      key={symbolItem.char}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRefineOptions((prev) => ({
                                          ...prev,
                                          headlineSymbol: symbolItem.char,
                                        }));
                                        setReportOptions((prev) => ({
                                          ...prev,
                                          headlineSymbol: symbolItem.char,
                                        }));
                                        setIsHeadlineMenuExpanded(false);
                                      }}
                                      className={`aspect-square flex items-center justify-center p-1 rounded-xl bg-gray-50 dark:bg-gray-800/20 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm cursor-pointer ${
                                        isSymbolSelected
                                          ? `${symbolItem.activeColor} scale-110 bg-white dark:bg-gray-700 shadow-sm`
                                          : "opacity-80 hover:opacity-100"
                                      }`}
                                      title={symbolItem.label}
                                    >
                                      <span>{symbolItem.char}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="flex flex-col items-center space-y-3 w-full px-2 relative">
                  {/* Bottom Utility Icons */}
                  <div
                    className="relative flex flex-col items-center w-full"
                    ref={themeMenuRef}
                  >
                    <button
                      onClick={() =>
                        setIsThemeMenuExpanded(!isThemeMenuExpanded)
                      }
                      className={`flex h-8 w-full items-center justify-center rounded-xl transition-all hover:scale-105 ${
                        isThemeMenuExpanded
                          ? "bg-white/30"
                          : "text-white hover:bg-white/20"
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
                          className="absolute left-[48px] top-1/2 -translate-y-1/2 flex items-center space-x-1 bg-[#009f75] p-1.5 rounded-r-xl shadow-[8px_4px_20px_rgba(0,0,0,0.2)] border border-white/20 border-l-0 z-50 origin-left"
                        >
                          <button
                            onClick={() => {
                              setTheme("light");
                              setIsThemeMenuExpanded(false);
                            }}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                              theme === "light"
                                ? "bg-white text-[#009f75] shadow-sm"
                                : "text-white hover:bg-white/10"
                            }`}
                            title="Light Theme"
                          >
                            <Sun size={16} strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => {
                              setTheme("dark");
                              setIsThemeMenuExpanded(false);
                            }}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                              theme === "dark"
                                ? "bg-white text-[#009f75] shadow-sm"
                                : "text-white hover:bg-white/10"
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
                    onClick={() => setShowSidebarCruds(!showSidebarCruds)}
                    className={`flex h-8 w-full items-center justify-center rounded-[12px] transition-all hover:scale-105 ${
                      showSidebarCruds
                        ? "bg-white/30 text-white"
                        : "text-white hover:bg-white/20"
                    }`}
                    title={showSidebarCruds ? "Hide Edit & Add buttons (Clean Mode)" : "Show Edit & Add buttons (Management Mode)"}
                    id="toggle-sidebar-cruds-btn"
                  >
                    {showSidebarCruds ? (
                      <Eye size={16} strokeWidth={2} />
                    ) : (
                      <EyeOff size={16} strokeWidth={2} />
                    )}
                  </button>

                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="flex h-8 w-full items-center justify-center rounded-[12px] bg-[#11b585] text-white transition-all hover:brightness-110 mb-2 shadow-inner"
                  >
                    <Settings size={16} strokeWidth={2} />
                  </button>

                  <button
                    onClick={() => setViewMode("trash")}
                    className={`flex h-8 w-full items-center justify-center rounded-[12px] bg-[#11b585] transition-all hover:brightness-110 mt-1 shadow-inner ${
                      viewMode === "trash"
                        ? "text-red-500 bg-white/10"
                        : "text-white"
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
                style={{ width: isSidebarOpen ? `${sidebarWidth}px` : "0px" }}
              >
                {/* Toggle Sidebar Button */}
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className={`absolute -right-5 top-1/2 -translate-y-1/2 w-5 h-16 border-l-0 rounded-r-xl shadow-sm flex items-center justify-center transition-colors cursor-pointer z-50 ${
                    theme === "dark"
                      ? "bg-[#1e2022] border-[#2d2f31] text-gray-400 hover:text-[#00df95] hover:bg-[#25282a]"
                      : "bg-white border-[#dce0e5] text-gray-500 hover:text-[#009f75] hover:bg-gray-50"
                  }`}
                  title={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
                >
                  {isSidebarOpen ? (
                    <ChevronLeft size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>

                {/* --- Sidebar (Navigation Rail) --- */}
                <aside
                  className={`flex flex-col border-r transition-colors duration-300 z-20 w-full h-full overflow-hidden ${
                    theme === "dark"
                      ? "bg-[#1e2022] border-[#2d2f31]"
                      : "bg-[#f0f2f5] border-[#e2e5e9]"
                  }`}
                >
                  <div
                    className="flex flex-col h-full overflow-hidden"
                    style={{ width: `${sidebarWidth}px` }}
                  >
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
                            theme === "dark"
                              ? "border-[#2d2f31]"
                              : "border-[#e2e5e9]"
                          }`}
                        >
                          <div className="px-4 flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <Target
                                size={14}
                                className="text-amber-600 animate-pulse"
                              />
                              <span
                                className={`text-[11px] font-black uppercase tracking-wider ${
                                  theme === "dark"
                                    ? "text-amber-500"
                                    : "text-amber-800"
                                }`}
                              >
                                AI Refinement Focus
                              </span>
                              <button
                                onClick={() => {
                                  if (
                                    workspaceActiveItemId === null &&
                                    customRefinements.length > 0
                                  ) {
                                    setWorkspaceActiveItemId(
                                      customRefinements[0].id,
                                    );
                                    setWorkspaceIsNewItem(false);
                                  }
                                  setIsFloatingRefinementOpen(true);
                                }}
                                className="p-1 rounded-md text-gray-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer select-none"
                                title="Open floating focus workspace"
                                id="open-floating-refinement-workspace-btn"
                              >
                                <Maximize2 size={11} className="stroke-[2.5]" />
                              </button>
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
                              {!isAddingRefinement && showSidebarCruds && (
                                <button
                                  onClick={() => setIsAddingRefinement(true)}
                                  className="flex h-6 items-center space-x-1 px-2.5 rounded-full bg-[#009f75]/10 dark:bg-[#009f75]/20 text-[#009f75] dark:text-[#00df95] hover:bg-[#009f75]/20 dark:hover:bg-[#009f75]/30 transition-all disabled:opacity-50"
                                  title="Create new direct preset"
                                  id="sidebar-create-preset-btn"
                                >
                                  <Plus size={12} strokeWidth={3} />
                                  <span className="text-[10px] font-bold">
                                    New
                                  </span>
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
                                  onChange={(e) =>
                                    setNewRefinementInstruction(e.target.value)
                                  }
                                  placeholder="Type a focus instruction (e.g. Focus on short-term support levels)..."
                                  className="w-full text-xs p-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:border-[#009f75] focus:ring-1 focus:ring-[#009f75] bg-white dark:bg-[#1f2123] dark:text-white font-semibold resize-none h-16 outline-none"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      if (newRefinementInstruction.trim()) {
                                        handleAddCustomRefinement(
                                          newRefinementInstruction,
                                        );
                                        setNewRefinementInstruction("");
                                        setIsAddingRefinement(false);
                                      }
                                    } else if (e.key === "Escape") {
                                      setNewRefinementInstruction("");
                                      setIsAddingRefinement(false);
                                    }
                                  }}
                                  autoFocus
                                />
                                <div className="flex items-center space-x-1 justify-end mt-1.5">
                                  <button
                                    onClick={() => {
                                      if (newRefinementInstruction.trim()) {
                                        handleAddCustomRefinement(
                                          newRefinementInstruction,
                                        );
                                        setNewRefinementInstruction("");
                                        setIsAddingRefinement(false);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded bg-[#009f75] hover:bg-[#008f65] text-white text-[10px] font-black tracking-wider transition-all"
                                  >
                                    SAVE PRESET
                                  </button>
                                  <button
                                    onClick={() => {
                                      setNewRefinementInstruction("");
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
                              <p className="text-[10px] text-gray-400 italic px-1 leading-snug">
                                No focus presets in database. Click "CREATE
                                DIRECT PRESET" to add one.
                              </p>
                            ) : (
                              <div
                                className="flex flex-col space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-0.5"
                                id="presets-list-sidebar"
                              >
                                {customRefinements.map((refItem) => {
                                  const isSelected =
                                    selectedRefinementIds.includes(refItem.id);
                                  const isCurrentlyEditing =
                                    editingRefinementId === refItem.id;

                                  return (
                                    <div
                                      key={refItem.id}
                                      className={`group/item flex flex-col px-2.5 py-1.5 rounded-lg text-[11px] border transition-all cursor-pointer select-none ${
                                        isSelected
                                          ? "bg-amber-500/10 text-amber-800 border-amber-500/80 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/80 shadow-xs"
                                          : "bg-white dark:bg-[#1c1e20] text-gray-600 dark:text-[#b4c3cd] border-gray-200/85 dark:border-gray-800/80 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-[#25272a]/50"
                                      }`}
                                      onClick={() => {
                                        if (!isCurrentlyEditing) {
                                          setSelectedRefinementIds((prev) =>
                                            prev.includes(refItem.id)
                                              ? prev.filter(
                                                  (id) => id !== refItem.id,
                                                )
                                              : [...prev, refItem.id],
                                          );
                                        }
                                      }}
                                    >
                                      {isCurrentlyEditing ? (
                                        <div
                                          className="flex items-center space-x-1 w-full"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <input
                                            type="text"
                                            value={editingRefinementText}
                                            onChange={(e) =>
                                              setEditingRefinementText(
                                                e.target.value,
                                              )
                                            }
                                            className="flex-1 px-1.5 py-0.5 text-[11px] text-black dark:text-white bg-white dark:bg-gray-800 border rounded focus:outline-none focus:ring-1 focus:ring-[#009f75] font-semibold min-w-0"
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                handleUpdateCustomRefinement(
                                                  refItem.id,
                                                  editingRefinementText,
                                                );
                                              } else if (e.key === "Escape") {
                                                setEditingRefinementId(null);
                                              }
                                            }}
                                            autoFocus
                                          />
                                          <button
                                            onClick={() =>
                                              handleUpdateCustomRefinement(
                                                refItem.id,
                                                editingRefinementText,
                                              )
                                            }
                                            className="p-1 hover:text-[#009f75] text-[#009f75]/80 transition-all shrink-0"
                                            title="Save change"
                                          >
                                            <Check
                                              size={11}
                                              className="stroke-[3]"
                                            />
                                          </button>
                                          <button
                                            onClick={() =>
                                              setEditingRefinementId(null)
                                            }
                                            className="p-1 hover:text-red-500 text-gray-400 transition-all shrink-0"
                                            title="Cancel"
                                          >
                                            <RotateCcw
                                              size={11}
                                              className="stroke-[3]"
                                            />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex items-center space-x-2 w-full">
                                            <span
                                              className={`w-3 h-3 rounded-full border flex items-center justify-center text-[7px] font-black transition-all shrink-0 ${
                                                isSelected
                                                  ? "bg-amber-600 border-amber-600 text-white"
                                                  : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#252729]"
                                              }`}
                                            >
                                              {isSelected && "✓"}
                                            </span>

                                            <span
                                              className="flex-1 leading-snug break-words pr-1 font-semibold block line-clamp-2 text-left"
                                              title={refItem.instruction}
                                            >
                                              <span>{refItem.instruction}</span>
                                              {refItem.elaborated_prompt &&
                                                refItem.elaborated_prompt.trim() && (
                                                  <span className="inline-block px-1 py-0.2 rounded-sm text-[8px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 font-bold border border-emerald-100/50 dark:border-emerald-900/40 select-none scale-90 origin-left ml-1">
                                                    ELABORATED
                                                  </span>
                                                )}
                                            </span>

                                            {showSidebarCruds && (
                                              <div
                                                className={`flex items-center space-x-1 pl-1 border-l border-gray-100 dark:border-gray-800 shrink-0 transition-opacity ${deletingRefinementId === refItem.id || editingElaboratedId === refItem.id ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"}`}
                                              >
                                              {deletingRefinementId ===
                                              refItem.id ? (
                                                <div
                                                  className="flex items-center space-x-1"
                                                  onClick={(e) =>
                                                    e.stopPropagation()
                                                  }
                                                >
                                                  <button
                                                    onClick={() =>
                                                      handleDeleteCustomRefinement(
                                                        refItem.id,
                                                      )
                                                    }
                                                    className="p-0.5 text-[#009f75] hover:text-[#007f5d] transition-all"
                                                    title="Confirm delete"
                                                  >
                                                    <Check
                                                      size={11}
                                                      className="stroke-[3]"
                                                    />
                                                  </button>
                                                  <button
                                                    onClick={() =>
                                                      setDeletingRefinementId(
                                                        null,
                                                      )
                                                    }
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
                                                      if (
                                                        editingElaboratedId ===
                                                        refItem.id
                                                      ) {
                                                        setEditingElaboratedId(
                                                          null,
                                                        );
                                                      } else {
                                                        setEditingElaboratedId(
                                                          refItem.id,
                                                        );
                                                        setElaboratedPromptText(
                                                          refItem.elaborated_prompt ||
                                                            "",
                                                        );
                                                      }
                                                    }}
                                                    className={`p-0.5 transition-all ${
                                                      refItem.elaborated_prompt &&
                                                      refItem.elaborated_prompt.trim()
                                                        ? "text-emerald-500 hover:text-emerald-600"
                                                        : "text-gray-400 hover:text-amber-500"
                                                    }`}
                                                    title={
                                                      refItem.elaborated_prompt &&
                                                      refItem.elaborated_prompt.trim()
                                                        ? "Edit detailed instruction prompt"
                                                        : "Add detailed instruction prompt"
                                                    }
                                                  >
                                                    <FileText size={10} />
                                                  </button>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setEditingRefinementId(
                                                        refItem.id,
                                                      );
                                                      setEditingRefinementText(
                                                        refItem.instruction,
                                                      );
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
                                                      setDeletingRefinementId(
                                                        refItem.id,
                                                      );
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
                                            )}
                                          </div>

                                          {editingElaboratedId ===
                                            refItem.id && (
                                            <div
                                              className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800/80 flex flex-col space-y-1.5 w-full cursor-default select-text"
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest flex items-center gap-1">
                                                  <Sparkles size={9} /> Complete
                                                  Prompt
                                                </span>
                                                {refItem.elaborated_prompt &&
                                                  refItem.elaborated_prompt.trim() && (
                                                    <button
                                                      onClick={() => {
                                                        if (
                                                          confirm(
                                                            "Are you sure you want to clear the elaborated prompt and fallback to the heading?",
                                                          )
                                                        ) {
                                                          handleUpdateCustomRefinementElaborated(
                                                            refItem.id,
                                                            refItem.instruction,
                                                            null,
                                                          );
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
                                                onChange={(e) =>
                                                  setElaboratedPromptText(
                                                    e.target.value,
                                                  )
                                                }
                                                placeholder="Type the full, detailed prompt instruction for the AI to consider when this focus is selected..."
                                                className="w-full h-24 p-1.5 text-[10px] leading-relaxed text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 rounded focus:ring-1 focus:ring-amber-500 focus:outline-none focus:border-transparent custom-scrollbar"
                                                onKeyDown={(e) => {
                                                  if (e.key === "Escape") {
                                                    setEditingElaboratedId(
                                                      null,
                                                    );
                                                  }
                                                }}
                                              />
                                              <div className="flex items-center justify-end space-x-1.5 pt-0.5">
                                                <button
                                                  onClick={() =>
                                                    setEditingElaboratedId(null)
                                                  }
                                                  className="px-2 py-1 text-[9px] font-bold rounded text-gray-400 hover:text-gray-650 hover:bg-gray-100 dark:hover:bg-gray-800/50 uppercase tracking-wide transition-all"
                                                >
                                                  Cancel
                                                </button>
                                                <button
                                                  onClick={() =>
                                                    handleUpdateCustomRefinementElaborated(
                                                      refItem.id,
                                                      refItem.instruction,
                                                      elaboratedPromptText,
                                                    )
                                                  }
                                                  className="px-2.5 py-1 text-[9px] font-bold rounded bg-amber-500 hover:bg-amber-600 text-white shadow-xs uppercase tracking-wide flex items-center space-x-1 transition-all"
                                                >
                                                  <Check
                                                    size={9}
                                                    className="stroke-[3]"
                                                  />
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
                      <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#6c7d8f]">
                        Market Sections
                      </h3>
                      {showSidebarCruds && (
                        <button
                          onClick={() => setAddingToParentId("root")}
                          disabled={isAddingCategory}
                          className="flex h-6 items-center space-x-1 px-2.5 rounded-full bg-[#ebf5f1]/50 text-[#009f75] hover:bg-[#d1e9e0] transition-all disabled:opacity-50"
                          title="Add New Section"
                        >
                          <Plus size={12} strokeWidth={3} />
                          <span className="text-[10px] font-bold">Add</span>
                        </button>
                      )}
                    </div>

                    {addingToParentId === "root" &&
                      (() => {
                        const isDuplicate = isDuplicateName(
                          newCategoryName,
                          null,
                        );
                        return (
                          <div className="px-3 mb-3">
                            <div
                              className={`flex items-center space-x-1 bg-white p-1 rounded-xl border shadow-sm ${isDuplicate ? "border-red-400 focus-within:border-red-500" : "border-[#dce0e5]"}`}
                            >
                              <input
                                autoFocus
                                type="text"
                                placeholder="Section name..."
                                className="flex-1 bg-transparent text-[13px] font-medium text-gray-700 px-2 py-1 outline-none"
                                value={newCategoryName}
                                onChange={(e) =>
                                  setNewCategoryName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleAddCategory();
                                  if (e.key === "Escape")
                                    setAddingToParentId(null);
                                }}
                              />
                              <button
                                onClick={handleAddCategory}
                                className={`p-1 rounded-lg ${isDuplicate ? "text-gray-400 cursor-not-allowed" : theme === "dark" ? "text-[#00df95] hover:bg-[#009f75]/10" : "text-[#009f75] hover:bg-[#ebf5f1]"}`}
                                disabled={isDuplicate}
                              >
                                <Check size={16} strokeWidth={2.5} />
                              </button>
                            </div>
                            {isDuplicate && (
                              <div className="text-[10px] text-red-500 mt-1 pl-1 font-medium">
                                This section name already exists.
                              </div>
                            )}
                          </div>
                        );
                      })()}

                    <nav className="flex flex-1 flex-col space-y-1.5 px-3 overflow-y-auto pb-4 pt-1">
                      {categories
                        .filter((c) => !c.parent_id)
                        .map((cat) => {
                          const subCats = categories.filter(
                              (c) => c.parent_id === cat.id,
                          );
                          const isExpanded = expandedCategories[cat.id];

                          return (
                            <div
                              key={cat.id}
                              className="flex flex-col space-y-1"
                            >
                              <div
                                className={`group relative flex items-center justify-between px-2 py-1 rounded-md transition-all cursor-pointer border ${
                                  activeCategory === cat.name
                                    ? theme === "dark"
                                      ? "bg-[#25282a] border-[#2e3134] shadow-sm text-white"
                                      : "bg-white border-[#dce0e5] shadow-sm text-[#394a5a]"
                                    : theme === "dark"
                                      ? "bg-[#1c1e20] border-transparent hover:bg-[#25282a] hover:border-[#2e3134] hover:shadow-sm text-[#8c9ba5]"
                                      : "bg-[#f8f9fa] border-transparent hover:bg-white hover:border-[#dce0e5] hover:shadow-sm"
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
                                    onClick={(e) =>
                                      toggleCategorySelection(e, cat.id)
                                    }
                                    className={`mr-2.5 flex h-[14px] w-[14px] shrink-0 flex-col items-center justify-center rounded-[3px] border ${
                                      selectedCategoryIds.has(Number(cat.id))
                                        ? "border-[#00a379] bg-[#00a379] text-white"
                                        : theme === "dark"
                                          ? "border-gray-600 bg-gray-800 hover:border-[#00a379]"
                                          : "border-[#cdd3d9] hover:border-[#009f75] bg-white"
                                    }`}
                                  >
                                    {selectedCategoryIds.has(
                                      Number(cat.id),
                                    ) && <Check size={10} strokeWidth={3.5} />}
                                  </div>
                                  <ChevronRight
                                    size={13}
                                    strokeWidth={2.5}
                                    className={`mr-2 text-[#9ba4af] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  />
                                  {editingCategoryId === cat.id ? (
                                    (() => {
                                      const isDuplicate = isDuplicateName(
                                        editingCategoryName,
                                        cat.parent_id || null,
                                        cat.id,
                                      );
                                      return (
                                        <input
                                          autoFocus
                                          type="text"
                                          value={editingCategoryName}
                                          onChange={(e) =>
                                            setEditingCategoryName(
                                              e.target.value,
                                            )
                                          }
                                          onBlur={() => {
                                            if (!isDuplicate)
                                              handleEditCategory(cat.id);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              if (!isDuplicate)
                                                handleEditCategory(cat.id);
                                            }
                                            if (e.key === "Escape")
                                              setEditingCategoryId(null);
                                          }}
                                          className={`px-1 -ml-1 text-[11px] font-extrabold tracking-wide uppercase truncate outline-none border rounded w-24 ${
                                            theme === "dark"
                                              ? `${isDuplicate ? "border-red-500 text-red-400 bg-gray-800" : "border-[#009f75] text-gray-100 bg-[#25282a]"}`
                                              : `${isDuplicate ? "border-red-500 text-red-600 bg-white" : "border-[#009f75] text-[#394a5a] bg-white"}`
                                          }`}
                                          onClick={(e) => e.stopPropagation()}
                                          title={
                                            isDuplicate
                                              ? "Name already exists"
                                              : ""
                                          }
                                        />
                                      );
                                    })()
                                  ) : (
                                    <span
                                      className={`text-[11px] font-extrabold tracking-wide uppercase truncate ${
                                        activeCategory === cat.name
                                          ? theme === "dark"
                                            ? "text-white"
                                            : "text-[#394a5a]"
                                          : theme === "dark"
                                            ? "text-[#8c9ba5]"
                                            : "text-[#6c7d8f]"
                                      }`}
                                    >
                                      {cat.name}
                                    </span>
                                  )}
                                  {showCountsInSidebar && (
                                    (() => {
                                      let designCount = reportingCounts[cat.id] || 0;
                                      categories.filter((c) => c.parent_id === cat.id).forEach((sub) => {
                                        designCount += reportingCounts[sub.id] || 0;
                                      });
                                      return (
                                        <span className={`ml-2 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-black leading-none border font-mono transition-all duration-200 hover:scale-105 ${
                                          designCount === 0
                                            ? theme === "dark"
                                              ? "bg-[#2d2f31]/60 text-gray-500 border-transparent animate-none"
                                              : "bg-gray-100 text-gray-400 border-transparent animate-none"
                                            : theme === "dark"
                                              ? "bg-[#009f75]/25 text-[#00ffbc] border-[#009f75]/40 shadow-[0_0_8px_rgba(0,159,117,0.15)]"
                                              : "bg-[#e2f5ee] text-[#00805c] border-[#9fe1c9] shadow-xs"
                                        }`}>
                                          {designCount}
                                        </span>
                                      );
                                    })()
                                  )}
                                </div>

                                 {showSidebarCruds && (
                                   <div className="flex items-center space-x-1 ml-auto">
                                     {/* Header/Footer Button */}
                                     <button
                                       type="button"
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         setHfEditingCategory(cat);
                                         setHfHeader(cat.header_text || "");
                                         setHfFooter(cat.footer_text || "");
                                         setIsHfHeaderActive(
                                           cat.is_header_active === 1,
                                         );
                                         setIsHfFooterActive(
                                           cat.is_footer_active === 1,
                                         );
                                         setIsHeaderFooterModalOpen(true);
                                       }}
                                       className={`p-1 rounded-md text-[#9ba4af] hover:text-[#00df95] transition-colors ${
                                         theme === "dark" ? "hover:bg-gray-800" : "hover:bg-[#ebf5f1]"
                                       }`}
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
                                         setNewCategoryName("");
                                         if (!expandedCategories[cat.id]) {
                                           toggleCategory(cat.id);
                                         }
                                       }}
                                       className={`p-1 rounded-md text-[#9ba4af] hover:text-[#00df95] transition-colors ${
                                         theme === "dark" ? "hover:bg-gray-800" : "hover:bg-[#ebf5f1]"
                                       }`}
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
                                       className={`p-1 rounded-md text-[#9ba4af] hover:text-[#00df95] transition-colors ${
                                         theme === "dark" ? "hover:bg-gray-800" : "hover:bg-[#ebf5f1]"
                                       }`}
                                       title="Edit Section"
                                     >
                                       <Pencil size={12} strokeWidth={2} />
                                     </button>
                                   </div>
                                 )}
                              </div>

                              {/* Sub-category Input */}
                              {addingToParentId === cat.id &&
                                (() => {
                                  const isDuplicate = isDuplicateName(
                                    newCategoryName,
                                    cat.id,
                                  );
                                  return (
                                    <div className="ml-7 pr-3 py-1">
                                      <div
                                        className={`flex items-center space-x-1 p-1 rounded-lg border shadow-sm ${
                                          theme === "dark"
                                            ? `bg-[#25282a] ${isDuplicate ? "border-red-500" : "border-[#2d2f31]"}`
                                            : `bg-white ${isDuplicate ? "border-red-400 focus-within:border-red-500" : "border-[#dce0e5]"}`
                                        }`}
                                      >
                                        <input
                                          autoFocus
                                          type="text"
                                          placeholder="Sub-section name..."
                                          className={`flex-1 bg-transparent text-[12px] font-bold px-2 py-1 outline-none ${
                                            theme === "dark" ? "text-gray-200 placeholder-gray-500" : "text-gray-700"
                                          }`}
                                          value={newCategoryName}
                                          onChange={(e) =>
                                            setNewCategoryName(e.target.value)
                                          }
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" &&
                                              !isDuplicate
                                            )
                                              handleAddSubCategory(cat.id);
                                            if (e.key === "Escape")
                                              setAddingToParentId(null);
                                          }}
                                        />
                                        <button
                                          onClick={() =>
                                            handleAddSubCategory(cat.id)
                                          }
                                          className={`p-1 rounded ${
                                            isDuplicate
                                              ? "text-gray-400 cursor-not-allowed"
                                              : theme === "dark"
                                                ? "text-[#00df95] hover:bg-[#009f75]/10"
                                                : "text-[#009f75] hover:bg-[#ebf5f1]"
                                          }`}
                                          disabled={isDuplicate}
                                        >
                                          <Check size={14} strokeWidth={3} />
                                        </button>
                                      </div>
                                      {isDuplicate && (
                                        <div className="text-[10px] text-red-500 mt-0.5 font-medium">
                                          This sub-section name already exists.
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                              {/* Sub-categories */}
                              {isExpanded && subCats.length > 0 && (
                                <div className="ml-[1.4rem] flex flex-col space-y-1 mb-1 relative before:absolute before:left-[7px] before:top-0 before:bottom-3 before:w-[2px] before:bg-[#e2e5e9] dark:before:bg-gray-700">
                                  {subCats.map((sub) => (
                                    <div
                                      key={sub.id}
                                      onClick={() => {
                                        setActiveCategory(sub.name);
                                        setActiveCategoryId(sub.id);
                                        setSelectedNews(null);
                                        setSelectedReport(null);
                                      }}
                                      className={`flex items-center pl-7 pr-3 py-1 rounded-md transition-all relative cursor-pointer border border-transparent ${
                                        activeCategory === sub.name
                                          ? theme === "dark"
                                            ? "bg-[#009f75]/20 text-[#00df95]"
                                            : "bg-[#ebf5f1] text-[#009f75]"
                                          : theme === "dark"
                                            ? "text-[#8c9ba5] hover:bg-[#25282a] hover:text-white hover:shadow-sm hover:border-[#2e3134]"
                                            : "text-[#6c7d8f] hover:bg-white hover:text-[#394a5a] hover:shadow-sm hover:border-[#dce0e5]"
                                      }`}
                                    >
                                      <div className="absolute left-[7px] top-1/2 -translate-y-1/2 w-3 h-[2px] bg-[#e2e5e9] dark:bg-gray-700"></div>
                                      <div
                                        onClick={(e) =>
                                          toggleCategorySelection(e, sub.id)
                                        }
                                        className={`mr-2.5 shrink-0 flex h-[13px] w-[13px] items-center justify-center rounded-[3px] border ${
                                          selectedCategoryIds.has(
                                            Number(sub.id),
                                          )
                                            ? "border-[#009f75] bg-[#009f75] text-white"
                                            : theme === "dark"
                                              ? "border-gray-600 bg-gray-800 hover:border-[#00df95]"
                                              : "border-[#cdd3d9] hover:border-[#009f75] bg-white"
                                        }`}
                                      >
                                        {selectedCategoryIds.has(
                                          Number(sub.id),
                                        ) && (
                                          <Check size={10} strokeWidth={3.5} />
                                        )}
                                      </div>
                                      {editingCategoryId === sub.id ? (
                                        (() => {
                                          const isDuplicate = isDuplicateName(
                                            editingCategoryName,
                                            sub.parent_id || null,
                                            sub.id,
                                          );
                                          return (
                                            <input
                                              autoFocus
                                              type="text"
                                              value={editingCategoryName}
                                              onChange={(e) =>
                                                setEditingCategoryName(
                                                  e.target.value,
                                                )
                                              }
                                              onBlur={() => {
                                                if (!isDuplicate)
                                                  handleEditCategory(sub.id);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  if (!isDuplicate)
                                                    handleEditCategory(sub.id);
                                                }
                                                if (e.key === "Escape")
                                                  setEditingCategoryId(null);
                                              }}
                                              className={`px-1 -ml-1 text-[11px] font-medium truncate outline-none border rounded w-24 ${
                                                theme === "dark"
                                                  ? `${isDuplicate ? "border-red-500 text-red-400 bg-gray-800" : "border-[#009f75] text-gray-100 bg-[#25282a]"}`
                                                  : `${isDuplicate ? "border-red-500 text-red-600 bg-white" : "border-[#009f75] text-[#394a5a] bg-white"}`
                                              }`}
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                              title={
                                                isDuplicate
                                                  ? "Name already exists"
                                                  : ""
                                              }
                                            />
                                          );
                                        })()
                                      ) : (
                                        <span className="text-[11px] font-medium truncate">
                                          {sub.name}
                                        </span>
                                      )}
                                      {showCountsInSidebar && (
                                        <span className={`ml-1.5 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-black leading-none border font-mono transition-all duration-200 hover:scale-105 ${
                                          (reportingCounts[sub.id] || 0) === 0
                                            ? theme === "dark"
                                              ? "bg-[#2d2f31]/60 text-gray-500 border-transparent"
                                              : "bg-gray-100 text-gray-400 border-transparent"
                                            : theme === "dark"
                                              ? "bg-[#009f75]/25 text-[#00ffbc] border-[#009f75]/40"
                                              : "bg-[#eef9f5] text-[#00805c] border-[#a0e2cb]/80 shadow-2xs"
                                        }`}>
                                          {reportingCounts[sub.id] || 0}
                                        </span>
                                      )}
                                      {showSidebarCruds && (
                                        <div className="ml-auto flex items-center space-x-0.5">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingCategoryId(sub.id);
                                              setEditingCategoryName(sub.name);
                                            }}
                                            className={`p-1 rounded-md transition-colors ${
                                              activeCategory === sub.name
                                                ? theme === "dark"
                                                  ? "text-[#00df95] hover:bg-[#009f75]/20"
                                                  : "text-[#009f75] hover:bg-[#d1e9e0]"
                                                : theme === "dark"
                                                  ? "text-[#9ba4af] hover:text-[#00df95] hover:bg-[#25282a]"
                                                  : "text-[#9ba4af] hover:text-[#009f75] hover:bg-[#ebf5f1]"
                                            }`}
                                            title="Edit Sub-section"
                                          >
                                            <Pencil size={11} strokeWidth={2} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                      {inputPlacement === "left" && (
                        <div className="h-px bg-gray-200 my-4 mx-2" />
                      )}

                      {/* Bottom Pinned Raw Input Area */}
                      {renderNewsInputArea("left")}
                    </nav>
                  </div>
                </aside>
              </div>

              {/* --- Main Dashboard Area --- */}
              <main
                ref={containerRef}
                className={`flex flex-1 overflow-hidden ${isResizing ? "cursor-col-resize select-none" : ""}`}
              >
                {/* Left Panel: Raw News Feed / Input */}
                <div
                  className={`flex flex-col transition-all duration-300 ease-in-out relative ${
                    isTimeMenuExpanded ? "z-32" : "z-10"
                  } ${maximizedPanel === "right" ? "hidden" : ""} ${
                    theme === "dark" ? "bg-[#1a1c1e]" : "bg-[#F7F5F2]"
                  }`}
                  style={{
                    width:
                      maximizedPanel === "left"
                        ? "100%"
                        : maximizedPanel === "right"
                          ? "0%"
                          : `${leftWidth}%`,
                  }}
                >
                  <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />
                  {/* Toolbar */}
                  <header
                    className={`flex h-12 shrink-0 items-center justify-between border-b px-4 transition-colors duration-300 ${
                      theme === "dark"
                        ? "bg-[#232527] border-[#2d2f31] text-gray-200"
                        : "bg-[#f0f2f5] border-[#dce0e5] text-[#394a5a]"
                    }`}
                  >
                    <div className="flex items-center space-x-3 flex-1 overflow-x-auto no-scrollbar">
                      {viewMode === "trash" && (
                        <div
                          className={`flex items-center space-x-3 pr-4 border-r h-6 ${
                            theme === "dark"
                              ? "border-[#2d2f31]"
                              : "border-[#dce0e5]"
                          }`}
                        >
                          <h2
                            className={`text-[12px] font-extrabold uppercase tracking-widest whitespace-nowrap ${
                              theme === "dark"
                                ? "text-gray-300"
                                : "text-[#394a5a]"
                            }`}
                          >
                            Trash Bin
                          </h2>
                        </div>
                      )}

                      {selectedNews && viewMode === "intelligence" && (
                        <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-left-2 duration-300">
                          {/* Language selection moved to vertical bar */}
                          {/* Format selection moved to vertical bar */}
                          {/* Layout selection moved to vertical bar */}

                          {/* Refinement triggers directly */}
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => openGenerateCriteriaModal(selectedNews)}
                              disabled={isRefining}
                              className="flex items-center justify-center bg-[#009f75] text-white p-1.5 rounded-lg text-xs font-black shadow-sm hover:bg-[#008f65] transition-all disabled:opacity-50"
                              title="Generate"
                            >
                              {isRefining ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Sparkles size={14} />
                              )}
                            </button>
                            <select
                              value={refineMode}
                              onChange={(e) =>
                                setRefineMode(
                                  e.target.value as "news" | "image",
                                )
                              }
                              className={`text-[9px] font-black uppercase tracking-widest bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-1 py-1 cursor-pointer transition-colors ${theme === "dark" ? "text-gray-200 hover:border-gray-700 focus:border-gray-600 bg-[#2d2f31]" : "text-[#394a5a] bg-white"}`}
                              style={{
                                WebkitAppearance: "none",
                                MozAppearance: "none",
                                appearance: "none",
                                paddingRight: "0.25rem",
                              }}
                            >
                              <option
                                className={
                                  theme === "dark" ? "text-gray-900" : ""
                                }
                                value="news"
                              >
                                News
                              </option>
                              <option
                                className={
                                  theme === "dark" ? "text-gray-900" : ""
                                }
                                value="image"
                              >
                                Image
                              </option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Gemini Model Selector */}
                      <div className="flex items-center border-l border-gray-400/20 pl-3 py-1">
                        {refineMode === "image" ? (
                          <select
                            value={selectedImageModel}
                            onChange={(e) =>
                              setSelectedImageModel(e.target.value)
                            }
                            disabled={isRefining}
                            className={`text-[10px] font-bold text-gray-700 bg-transparent py-1 cursor-pointer focus:outline-none hover:text-gray-900 border border-transparent rounded transition-colors disabled:opacity-50 ${theme === "dark" ? "text-gray-300 hover:text-white bg-[#232527] focus:bg-[#2d2f31]" : ""}`}
                          >
                            <option
                              className={
                                theme === "dark" ? "text-gray-900" : ""
                              }
                              value="gemini-2.5-flash-image"
                            >
                              2.5 Flash Image
                            </option>
                            <option
                              className={
                                theme === "dark" ? "text-gray-900" : ""
                              }
                              value="imagen-3.0-generate-002"
                            >
                              Imagen 3.0
                            </option>
                            <option
                              className={
                                theme === "dark" ? "text-gray-900" : ""
                              }
                              value="imagen-2.0"
                            >
                              Imagen 2.0
                            </option>
                          </select>
                        ) : (
                          <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            disabled={isRefining}
                            className={`text-[10px] font-bold text-gray-700 bg-transparent py-1 cursor-pointer focus:outline-none hover:text-gray-900 border border-transparent rounded transition-colors disabled:opacity-50 ${theme === "dark" ? "text-gray-300 hover:text-white bg-[#232527] focus:bg-[#2d2f31]" : ""}`}
                          >
                            <option
                              className={
                                theme === "dark" ? "text-gray-900" : ""
                              }
                              value="gemini-3.5-flash"
                            >
                              3.5 Flash
                            </option>
                            <option
                              className={
                                theme === "dark" ? "text-gray-900" : ""
                              }
                              value="gemini-3.1-flash-lite"
                            >
                              3.1 Lite
                            </option>
                            <option
                              className={
                                theme === "dark" ? "text-gray-900" : ""
                              }
                              value="gemini-3.1-pro-preview"
                            >
                              3.1 Pro
                            </option>
                          </select>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 ml-4">
                      {viewMode === "intelligence" && (
                        <div
                          className={`flex items-center p-0.5 rounded-lg border shadow-xs ${
                            theme === "dark"
                              ? "bg-[#2d2f31]/90 border-[#3d4144]"
                              : "bg-gray-100/85 border-gray-200/85"
                          }`}
                        >
                          {/* Feed Filter Dropdown */}
                          <div
                            className="relative flex flex-col items-center"
                            ref={feedMenuRef}
                          >
                            <button
                              onClick={() =>
                                setIsFeedMenuExpanded(!isFeedMenuExpanded)
                              }
                              className={`flex items-center space-x-1 px-3 py-1 rounded-[6px] text-[9px] font-black tracking-widest transition-all focus:outline-none cursor-pointer ${
                                isFeedMenuExpanded
                                  ? "text-[#009f75] bg-[#009f75]/10"
                                  : "text-gray-500 hover:text-gray-700 dark:hover:text-white dark:hover:bg-white/10"
                              }`}
                            >
                              <span className="leading-none">
                                {feedFilter.toUpperCase()}
                              </span>
                              <ChevronDown
                                size={11}
                                className={`transform transition-transform duration-200 ${isFeedMenuExpanded ? "rotate-180" : ""}`}
                              />
                            </button>

                            <AnimatePresence>
                              {isFeedMenuExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, y: -8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -8 }}
                                  transition={{
                                    duration: 0.12,
                                    ease: "easeOut",
                                  }}
                                  className={`absolute left-0 top-full mt-2 py-1.5 rounded-xl shadow-[0_15px_30px_rgba(0,0,0,0.15)] border z-[60] min-w-[110px] origin-top-left ${
                                    theme === "dark"
                                      ? "bg-[#25282a] border-[#2d2f31] text-gray-200"
                                      : "bg-white border-gray-200 text-gray-700"
                                  }`}
                                >
                                  {["all", "refined", "raw"].map((id) => (
                                    <button
                                      key={id}
                                      onClick={() => {
                                        setFeedFilter(id as any);
                                        setIsFeedMenuExpanded(false);
                                      }}
                                      className={`w-full text-left px-4 py-2 text-[10px] uppercase font-black tracking-widest transition-all hover:bg-[#009f75]/10 hover:text-[#009f75] ${
                                        feedFilter === id
                                          ? "text-[#009f75] bg-[#009f75]/5"
                                          : "text-gray-500 dark:text-gray-400"
                                      }`}
                                    >
                                      {id}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Separator */}
                          <div
                            className={`h-4 w-[1px] mx-1.5 ${theme === "dark" ? "bg-[#3d4144]" : "bg-gray-300"}`}
                          />

                          {/* Criteria Filter Dropdown */}
                          <div
                            className="relative flex flex-col items-center"
                            ref={criteriaMenuRef}
                          >
                            <button
                              onClick={() =>
                                setIsCriteriaMenuExpanded(
                                  !isCriteriaMenuExpanded,
                                )
                              }
                              className={`flex items-center space-x-1 px-3 py-1 rounded-[6px] text-[9px] font-black tracking-widest transition-all focus:outline-none cursor-pointer ${
                                isCriteriaMenuExpanded
                                  ? "text-[#009f75] bg-[#009f75]/10"
                                  : "text-gray-500 hover:text-gray-700 dark:hover:text-white dark:hover:bg-white/10"
                              }`}
                            >
                              <span className="leading-none text-left truncate max-w-[120px]">
                                CRITERIA:{" "}
                                {criteriaFilter === "all"
                                  ? "ALL"
                                  : (
                                      criteriaList.find(
                                        (c) => c.id === criteriaFilter,
                                      )?.name || "ALL"
                                    ).toUpperCase()}
                              </span>
                              <ChevronDown
                                size={11}
                                className={`transform transition-transform duration-200 ${isCriteriaMenuExpanded ? "rotate-180" : ""}`}
                              />
                            </button>

                            <AnimatePresence>
                              {isCriteriaMenuExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, y: -8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -8 }}
                                  transition={{
                                    duration: 0.12,
                                    ease: "easeOut",
                                  }}
                                  className={`absolute left-0 top-full mt-2 py-1.5 rounded-xl shadow-[0_15px_30px_rgba(0,0,0,0.15)] border z-[60] min-w-[130px] origin-top-left ${
                                    theme === "dark"
                                      ? "bg-[#25282a] border-[#2d2f31] text-gray-200"
                                      : "bg-white border-gray-200 text-gray-700"
                                  }`}
                                >
                                  <button
                                    onClick={() => {
                                      setCriteriaFilter("all");
                                      setIsCriteriaMenuExpanded(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-[10px] uppercase font-black tracking-widest transition-all hover:bg-[#009f75]/10 hover:text-[#009f75] ${
                                      criteriaFilter === "all"
                                        ? "text-[#009f75] bg-[#009f75]/5"
                                        : "text-gray-500 dark:text-gray-400"
                                    }`}
                                  >
                                    All Criteria
                                  </button>
                                  {criteriaList.map((crit) => (
                                    <button
                                      key={crit.id}
                                      onClick={() => {
                                        setCriteriaFilter(crit.id);
                                        setIsCriteriaMenuExpanded(false);
                                      }}
                                      className={`w-full text-left px-4 py-2 text-[10px] uppercase font-black tracking-widest transition-all hover:bg-[#009f75]/10 hover:text-[#009f75] ${
                                        criteriaFilter === crit.id
                                          ? "text-[#009f75] bg-[#009f75]/5"
                                          : "text-gray-500 dark:text-gray-400"
                                      }`}
                                    >
                                      {crit.name}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Separator */}
                          <div
                            className={`h-4 w-[1px] mx-1.5 ${theme === "dark" ? "bg-[#3d4144]" : "bg-gray-300"}`}
                          />

                          {/* Time dropdown option shifted here and styled to slide down */}
                          <div
                            className="relative flex flex-col items-center"
                            ref={timeMenuRef}
                          >
                            <button
                              onClick={() =>
                                setIsTimeMenuExpanded(!isTimeMenuExpanded)
                              }
                              className={`flex items-center space-x-1 px-3 py-1 rounded-[6px] text-[9px] font-black tracking-widest transition-all focus:outline-none cursor-pointer ${
                                isTimeMenuExpanded
                                  ? "text-[#009f75] bg-[#009f75]/10"
                                  : "text-gray-500 hover:text-gray-700 dark:hover:text-white dark:hover:bg-white/10"
                              }`}
                              title={
                                timeFilter === "custom" &&
                                customDateRange?.from &&
                                customDateRange?.to
                                  ? `Active: ${format(customDateRange.from, "d MMM, yyyy")} - ${format(customDateRange.to, "d MMM, yyyy")}`
                                  : `Time Filter: ${timeFilterDisplayNames[timeFilter]}`
                              }
                            >
                              <span className="leading-none flex items-center">
                                {timeFilter === "custom" &&
                                customDateRange?.from &&
                                customDateRange?.to ? (
                                  `${format(customDateRange.from, "MM/dd")}-${format(customDateRange.to, "MM/dd")}`
                                ) : (
                                  <span className="flex items-center">
                                    {timeFilter === "stared" && (
                                      <Star
                                        size={11}
                                        className="mr-1 text-yellow-500 fill-yellow-500"
                                      />
                                    )}
                                    <span>{timeFilterDisplayNames[timeFilter]}</span>
                                  </span>
                                )}
                              </span>
                              <ChevronDown
                                size={11}
                                className={`transform transition-transform duration-200 ${isTimeMenuExpanded ? "rotate-180" : ""}`}
                              />
                            </button>

                            <AnimatePresence>
                              {isTimeMenuExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, y: -8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -8 }}
                                  transition={{
                                    duration: 0.12,
                                    ease: "easeOut",
                                  }}
                                  className={`absolute right-0 top-full mt-2 py-1.5 rounded-xl shadow-[0_15px_30px_rgba(0,0,0,0.15)] border z-[60] min-w-[130px] origin-top-right ${
                                    theme === "dark"
                                      ? "bg-[#25282a] border-[#2d2f31] text-gray-200"
                                      : "bg-white border-gray-200 text-gray-700"
                                  }`}
                                >
                                  {[
                                    "today",
                                    "yesterday",
                                    "1week",
                                    "2week",
                                    "1month",
                                    "3month",
                                    "custom",
                                    "stared",
                                  ].map((id) => (
                                    <button
                                      key={id}
                                      onClick={() => {
                                        setTimeFilter(id as any);
                                        if (id === "custom") {
                                          setIsCalendarOpen("from");
                                        } else {
                                          setIsTimeMenuExpanded(false);
                                        }
                                      }}
                                      className={`w-full text-left px-4 py-2 text-[10px] uppercase font-black tracking-widest transition-all hover:bg-[#009f75]/10 hover:text-[#009f75] flex items-center ${
                                        timeFilter === id
                                          ? "text-[#009f75] bg-[#009f75]/5"
                                          : "text-gray-500 dark:text-gray-400"
                                      }`}
                                    >
                                      {id === "stared" && (
                                        <Star
                                          size={10}
                                          className="mr-1.5 text-yellow-500 fill-yellow-500 shrink-0 animate-pulse"
                                        />
                                      )}
                                      <span>{timeFilterDisplayNames[id]}</span>
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Float calendars absolute right aligned with dropdown */}
                            <AnimatePresence>
                              {isTimeMenuExpanded &&
                                timeFilter === "custom" &&
                                isCalendarOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10, x: 10 }}
                                    animate={{ opacity: 1, y: 0, x: 0 }}
                                    exit={{ opacity: 0, y: 10, x: 10 }}
                                    className={`absolute top-full mt-2 z-[100] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border p-4 flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6 origin-top-right min-w-0 md:min-w-[580px] max-w-[95vw] ${
                                      maximizedPanel === "left"
                                        ? "right-0"
                                        : "right-0 md:right-[-250px]"
                                    } ${
                                      theme === "dark"
                                        ? "bg-[#1e2022] border-[#2d2f31] text-white"
                                        : "bg-white border-gray-200 text-gray-800"
                                    }`}
                                    ref={calendarRef}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex-1 min-w-[240px]">
                                      <div className="flex items-center justify-between mb-3 px-1">
                                        <span className="text-[10px] font-black text-[#009f75] uppercase tracking-wider">
                                          Start Date
                                        </span>
                                        {customDateRange?.from && (
                                          <span className="text-[10px] font-bold text-gray-400">
                                            {format(customDateRange.from, "PP")}
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        className={`border rounded-xl p-1 ${theme === "dark" ? "bg-[#25282a] border-[#2d2f31]" : "bg-gray-50/50"}`}
                                      >
                                        <DayPicker
                                          mode="single"
                                          selected={customDateRange?.from}
                                          onSelect={(date) => {
                                            if (date) {
                                              setCustomDateRange((prev) => ({
                                                from: date,
                                                to: prev?.to || date,
                                              }));
                                              setIsCalendarOpen("to");
                                            }
                                          }}
                                          className="m-0 text-gray-800 dark:text-gray-100"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex-1 border-t pt-4 md:border-t-0 md:pt-0 md:border-l md:pl-6 border-gray-200 dark:border-gray-700 min-w-[240px]">
                                      <div className="flex items-center justify-between mb-3 px-1">
                                        <span className="text-[10px] font-black text-[#009f75] uppercase tracking-wider">
                                          End Date
                                        </span>
                                        {customDateRange?.to && (
                                          <span className="text-[10px] font-bold text-gray-400">
                                            {format(customDateRange.to, "PP")}
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        className={`border rounded-xl p-1 ${theme === "dark" ? "bg-[#25282a] border-[#2d2f31]" : "bg-gray-50/50"}`}
                                      >
                                        <DayPicker
                                          mode="single"
                                          selected={customDateRange?.to}
                                          onSelect={(date) => {
                                            if (date) {
                                              setCustomDateRange((prev) => {
                                                if (
                                                  prev?.from &&
                                                  date < prev.from
                                                )
                                                  return {
                                                    from: date,
                                                    to: prev.from,
                                                  };
                                                return {
                                                  from: prev?.from,
                                                  to: date,
                                                };
                                              });
                                            }
                                          }}
                                          className="m-0 text-gray-800 dark:text-gray-100"
                                        />
                                      </div>
                                      <div className="mt-4 flex justify-end">
                                        <button
                                          onClick={() => {
                                            setIsCalendarOpen(false);
                                            setIsTimeMenuExpanded(false);
                                          }}
                                          className="px-4 py-1.5 bg-[#009f75] text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-[#008f65] shadow-sm transition-colors cursor-pointer"
                                        >
                                          Confirm Range
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                            </AnimatePresence>
                          </div>
                        </div>
                      )}
                      {viewMode === "trash" && (
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => setViewMode("intelligence")}
                            className={`flex items-center space-x-2 px-4 py-1.5 rounded-md text-xs font-black transition-all border ${
                              theme === "dark"
                                ? "bg-white/10 text-white hover:bg-white/20 border-white/20"
                                : "bg-[#009f75] text-white hover:bg-[#008f65] border-[#009f75] shadow-sm"
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
                    {viewMode === "intelligence" ? (
                      <div className="flex flex-col relative z-10 flex-1 overflow-hidden">
                        {renderNewsInputArea("top")}
                        {/* History Feed */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                          {isLoadingFeed ? (
                            <div className="flex justify-center py-8">
                              <Loader2
                                size={24}
                                className="animate-spin text-gray-400"
                              />
                            </div>
                          ) : sortedDateStrings.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 italic text-sm font-medium">
                              No news entries found for this selection.
                            </div>
                          ) : (
                            sortedDateStrings.map((dateStr) => (
                              <div key={dateStr} className="space-y-4">
                                <div className="flex items-center space-x-4 px-2">
                                  <span className="text-[10px] font-black text-gray-400 tracking-[0.2em]">
                                    {formatDateHeading(dateStr)}
                                  </span>
                                  <div
                                    className={`h-[1px] flex-1 ${theme === "dark" ? "bg-[#2d2f31]" : "bg-gray-200"}`}
                                  />
                                </div>

                                <div className="space-y-4">
                                  {(() => {
                                    const items = newsGroups[dateStr].filter(
                                      (item) =>
                                        !isStarredOnly ||
                                        starredNewsIds.has(item.id),
                                    );
                                    let displayBundles = [];

                                    const rawMap = new Map();
                                    const refinedMap = new Map();
                                    const orphans = [];

                                    items.forEach((item) => {
                                      if (item.type === "raw")
                                        rawMap.set(item.id, item);
                                      else if (
                                        item.type === "refined" &&
                                        item.parent_id
                                      ) {
                                        if (!refinedMap.has(item.parent_id))
                                          refinedMap.set(item.parent_id, []);
                                        refinedMap
                                          .get(item.parent_id)
                                          .push(item);
                                      } else orphans.push(item);
                                    });

                                    rawMap.forEach((rawItem, rawId) => {
                                      const refinedItems =
                                        refinedMap.get(rawId) || [];
                                      const hasRefinedGlobally = newsFeed.some(
                                        (n) => n.parent_id === rawId,
                                      );

                                      if (
                                        refinedItems.length > 0 ||
                                        hasRefinedGlobally
                                      ) {
                                        refinedItems.sort(
                                          (a, b) =>
                                            parseSafeDate(
                                              b.created_at,
                                            ).getTime() -
                                            parseSafeDate(
                                              a.created_at,
                                            ).getTime(),
                                        );
                                        displayBundles.push({
                                          isBundle: true,
                                          items: [...refinedItems, rawItem],
                                          id: `bundle-${rawId}`,
                                        });
                                        refinedMap.delete(rawId);
                                      } else {
                                        displayBundles.push({
                                          isBundle: false,
                                          items: [rawItem],
                                          id: `single-${rawItem.id}`,
                                        });
                                      }
                                    });

                                    refinedMap.forEach((rItems, parentId) => {
                                      rItems.sort(
                                        (a, b) =>
                                          parseSafeDate(
                                            b.created_at,
                                          ).getTime() -
                                          parseSafeDate(a.created_at).getTime(),
                                      );
                                      displayBundles.push({
                                        isBundle: true,
                                        items: rItems,
                                        id: `bundle-ref-only-${parentId}`,
                                      });
                                    });

                                    orphans.forEach((o) =>
                                      displayBundles.push({
                                        isBundle: false,
                                        items: [o],
                                        id: `single-${o.id}`,
                                      }),
                                    );

                                    displayBundles.sort((a, b) => {
                                      const aMax = Math.max(
                                        ...a.items.map((i) =>
                                          parseSafeDate(i.created_at).getTime(),
                                        ),
                                      );
                                      const bMax = Math.max(
                                        ...b.items.map((i) =>
                                          parseSafeDate(i.created_at).getTime(),
                                        ),
                                      );
                                      return bMax - aMax;
                                    });

                                    return displayBundles.map((bundle) => (
                                      <div
                                        key={bundle.id}
                                        className={
                                          bundle.isBundle
                                            ? `rounded-[1.25rem] p-2 border-2 space-y-2 ${theme === "dark" ? "border-[#009f75] bg-transparent" : "border-[#009f75] bg-transparent"}`
                                            : ""
                                        }
                                      >
                                        {bundle.items.map((item) => (
                                          <div
                                            key={item.id}
                                            className={`group relative w-full p-4 pl-12 rounded-xl border-2 transition-all cursor-pointer flex flex-col ${
                                              selectedNews?.id === item.id
                                                ? theme === "dark"
                                                  ? "border-[#009f75] bg-[#009f75]/10 shadow-lg"
                                                  : "border-[#009f75] bg-green-50 shadow-md"
                                                : theme === "dark"
                                                  ? "border-[#2d2f31] bg-[#232527] hover:border-[#3d3f41] hover:bg-[#2a2c2e]"
                                                  : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                                            } ${expandedNewsIds.has(item.id) ? "h-64" : "h-auto"}`}
                                            onClick={() => {
                                              setSelectedNews(item);
                                              setSelectedReport(null);
                                            }}
                                          >
                                            {/* Front Controls: Selection & Star */}
                                            <div className="absolute left-3 top-4 flex flex-col items-center space-y-3 z-10">
                                              <button
                                                onClick={(e) =>
                                                  handleToggleSelect(item.id, e)
                                                }
                                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                                  selectedNewsIds.has(item.id)
                                                    ? "bg-[#009f75] border-[#009f75] text-white shadow-sm"
                                                    : theme === "dark"
                                                      ? "border-[#3d3f41] hover:border-[#009f75]"
                                                      : "border-gray-300 hover:border-[#009f75]"
                                                }`}
                                              >
                                                {selectedNewsIds.has(
                                                  item.id,
                                                ) && (
                                                  <Check
                                                    size={14}
                                                    strokeWidth={3}
                                                  />
                                                )}
                                              </button>
                                              <button
                                                onClick={(e) =>
                                                  handleToggleStar(item.id, e)
                                                }
                                                className={`transition-all hover:scale-110 ${
                                                  starredNewsIds.has(item.id)
                                                    ? "text-yellow-500 fill-yellow-500"
                                                    : "text-gray-300 hover:text-yellow-400"
                                                }`}
                                                title={
                                                  starredNewsIds.has(item.id)
                                                    ? "Unstar"
                                                    : "Star"
                                                }
                                              >
                                                <Star
                                                  size={18}
                                                  fill={
                                                    starredNewsIds.has(item.id)
                                                      ? "currentColor"
                                                      : "none"
                                                  }
                                                />
                                              </button>
                                            </div>

                                            <div className="flex justify-between items-start mb-2">
                                              <div className="flex items-center space-x-2">
                                                <span
                                                  className={`text-xs font-mono font-bold ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}
                                                >
                                                  {parseSafeDate(
                                                    item.created_at,
                                                  ).toLocaleDateString([], {
                                                    month: "short",
                                                    day: "numeric",
                                                  })}
                                                  ,{" "}
                                                  {parseSafeDate(
                                                    item.created_at,
                                                  ).toLocaleTimeString([], {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                  })}
                                                </span>
                                                {item.type === "refined" && (
                                                  <div className="flex items-center space-x-1.5 flex-wrap">
                                                    <div
                                                      className="relative inline-block z-10"
                                                      onClick={(e) =>
                                                        e.stopPropagation()
                                                      }
                                                    >
                                                      <select
                                                        value={
                                                          item.criteria_id || ""
                                                        }
                                                        onChange={(e) => {
                                                          const val = e.target
                                                            .value
                                                            ? Number(
                                                                e.target.value,
                                                              )
                                                            : null;
                                                          handleUpdateNewsCriteria(
                                                            item.id,
                                                            val,
                                                          );
                                                        }}
                                                        className={`text-[9.5px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border focus:outline-none cursor-pointer scale-95 origin-left transition-all ${
                                                          item.criteria_id
                                                            ? theme === "dark"
                                                              ? "bg-amber-950/45 text-amber-300 border-amber-800/40"
                                                              : "bg-amber-100 text-amber-800 border-amber-300"
                                                            : theme === "dark"
                                                              ? "bg-[#2d2f31] text-gray-400 border-transparent hover:border-gray-600"
                                                              : "bg-gray-150 text-gray-500 border-transparent hover:border-gray-300"
                                                        }`}
                                                      >
                                                        <option value="">
                                                          No Criteria
                                                        </option>
                                                        {criteriaList.map(
                                                          (c) => (
                                                            <option
                                                              key={c.id}
                                                              value={c.id}
                                                            >
                                                              {c.name}
                                                            </option>
                                                          ),
                                                        )}
                                                      </select>
                                                    </div>
                                                  </div>
                                                )}
                                                {item.type === "raw" &&
                                                  item.images &&
                                                  item.images.length > 0 && (
                                                    <span
                                                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter flex items-center ${
                                                        theme === "dark"
                                                          ? "bg-gray-800 text-gray-400"
                                                          : "bg-gray-100 text-gray-500"
                                                      }`}
                                                    >
                                                      <ImageIcon
                                                        size={9}
                                                        className="mr-1"
                                                      />
                                                      <span className="tabular-nums font-black">
                                                        {item.images.length}{" "}
                                                        {item.images.length ===
                                                        1
                                                          ? "IMAGE"
                                                          : "IMAGES"}
                                                      </span>
                                                    </span>
                                                  )}
                                              </div>
                                              <div className="flex items-center space-x-2">
                                                {item.summary_en && (
                                                  <span className="text-[10px] bg-[#009f75] text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow-sm">
                                                    Refined
                                                  </span>
                                                )}
                                                <button
                                                  onClick={(e) =>
                                                    toggleExpandNews(item.id, e)
                                                  }
                                                  className={`p-1 rounded-md transition-colors ${expandedNewsIds.has(item.id) ? "bg-[#ebf5f1] text-[#009f75]" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"}`}
                                                  title={
                                                    expandedNewsIds.has(item.id)
                                                      ? "Collapse"
                                                      : "Expand"
                                                  }
                                                >
                                                  {expandedNewsIds.has(
                                                    item.id,
                                                  ) ? (
                                                    <ChevronDown size={16} />
                                                  ) : (
                                                    <Maximize2 size={14} />
                                                  )}
                                                </button>
                                                <button
                                                  onClick={(e) =>
                                                    handleEditNews(item, e)
                                                  }
                                                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-[#009f75] transition-all"
                                                  title="Edit News"
                                                >
                                                  <Pencil size={16} />
                                                </button>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleMoveToTrash(
                                                      item.id,
                                                      "news",
                                                    );
                                                  }}
                                                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all"
                                                  title="Move to Trash"
                                                >
                                                  <Trash2 size={16} />
                                                </button>
                                              </div>
                                            </div>
                                            <div
                                              className={`text-sm leading-relaxed font-medium overflow-y-auto custom-scrollbar ${
                                                theme === "dark" ? "text-gray-200" : "text-gray-900"
                                              } ${expandedNewsIds.has(item.id) ? "flex-1 pr-2" : "line-clamp-2 overflow-hidden"}`}
                                            >
                                              {getNewsPreviewText(item)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ));
                                  })()}{" "}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
                        <div className="p-4 border-b border-gray-300 bg-[#f0f2f5]">
                          <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-900">
                            Trash Bin
                          </h3>
                          <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                            Items here will be permanently deleted if you
                            choose.
                          </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                          {/* Deleted News */}
                          <section>
                            <div className="flex items-center space-x-2 px-2 mb-3">
                              <Send size={14} className="text-gray-400" />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                Deleted Intelligence
                              </span>
                            </div>
                            {isLoadingTrash ? (
                              <div className="flex justify-center py-4">
                                <Loader2
                                  size={20}
                                  className="animate-spin text-gray-300"
                                />
                              </div>
                            ) : trashItems.news.length === 0 ? (
                              <p className="text-xs text-gray-400 italic px-2">
                                No deleted news items.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {trashItems.news.map((item) => (
                                  <div
                                    key={item.id}
                                    className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center"
                                  >
                                    <div className="flex-1 min-w-0 mr-4">
                                      <div className="flex items-center space-x-2 mb-1">
                                        <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-bold text-gray-600">
                                          {item.category}
                                        </span>
                                        <span className="text-[10px] text-gray-400">
                                          {parseSafeDate(
                                            item.created_at,
                                          ).toLocaleDateString()}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-900 truncate">
                                        {item.raw_text}
                                      </p>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <button
                                        onClick={() =>
                                          handleRestore(item.id, "news")
                                        }
                                        className="p-1.5 text-gray-400 hover:text-[#009f75] hover:bg-green-50 rounded transition-all"
                                        title="Restore"
                                      >
                                        <RotateCcw size={14} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handlePermanentDelete(item.id, "news")
                                        }
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
                              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                Deleted Reports
                              </span>
                            </div>
                            {isLoadingTrash ? (
                              <div className="flex justify-center py-4">
                                <Loader2
                                  size={20}
                                  className="animate-spin text-gray-300"
                                />
                              </div>
                            ) : trashItems.reports.length === 0 ? (
                              <p className="text-xs text-gray-400 italic px-2">
                                No deleted reports.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {trashItems.reports.map((report) => (
                                  <div
                                    key={report.id}
                                    className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center"
                                  >
                                    <div className="flex-1 min-w-0 mr-4">
                                      <div className="flex items-center space-x-2 mb-1">
                                        <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-bold text-gray-600">
                                          {report.category}
                                        </span>
                                        <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase">
                                          {report.type}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-900 truncate">
                                        {report.category} {report.type} Report
                                      </p>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <button
                                        onClick={() =>
                                          handleRestore(report.id, "report")
                                        }
                                        className="p-1.5 text-gray-400 hover:text-[#009f75] hover:bg-green-50 rounded transition-all"
                                        title="Restore"
                                      >
                                        <RotateCcw size={14} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handlePermanentDelete(
                                            report.id,
                                            "report",
                                          )
                                        }
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

                    {/* If left panel is maximized, show slideback chevron to restore right panel */}
                    {maximizedPanel === "left" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMaximize("left");
                        }}
                        className={`absolute right-0 top-1/2 -translate-y-1/2 w-5 h-16 border rounded-l-xl shadow-md flex items-center justify-center transition-all cursor-pointer z-50 ${
                          theme === "dark"
                            ? "bg-[#1e2022] border-[#2d2f31] text-gray-400 hover:text-white hover:bg-gray-800"
                            : "bg-white border-gray-200 border-r-0 text-gray-400 hover:text-[#009f75] hover:bg-gray-50"
                        }`}
                        title="Restore right panel"
                      >
                        <ChevronLeft size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Resize Handle */}
                {!maximizedPanel && (
                  <div
                    onMouseDown={startResizing}
                    className="group relative w-1.5 cursor-col-resize flex justify-center items-center h-full select-none z-30 animate-in fade-in duration-300"
                  >
                    <div
                      className={`w-[1px] h-full transition-colors group-hover:bg-[#009f75] ${
                        isResizing
                          ? "bg-[#009f75]"
                          : theme === "dark"
                            ? "bg-[#2d2f31]"
                            : "bg-[#dce0e5]"
                      }`}
                    />

                    {/* Center Slide In / Slide Out controls on the divider line */}
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className={`absolute top-1/2 -translate-y-1/2 w-6 h-16 rounded-xl border shadow-md flex flex-col items-center justify-center space-y-1 z-45 transition-colors cursor-default ${
                        theme === "dark"
                          ? "bg-[#1e2022] border-[#2d2f31]"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMaximize("right"); // Sets right maximized (collapses left)
                        }}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          theme === "dark"
                            ? "text-gray-400 hover:text-white"
                            : "text-gray-400 hover:text-[#009f75] hover:bg-gray-50"
                        }`}
                        title="Collapse left panel"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <div
                        className={`w-3/5 h-[1px] ${theme === "dark" ? "bg-gray-800" : "bg-gray-150"}`}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMaximize("left"); // Sets left maximized (collapses right)
                        }}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          theme === "dark"
                            ? "text-gray-400 hover:text-white"
                            : "text-gray-400 hover:text-[#009f75] hover:bg-gray-50"
                        }`}
                        title="Collapse right panel"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Right Panel: Refined Intelligence */}
                <div
                  className={`flex flex-col relative transition-all duration-300 ease-in-out ${maximizedPanel === "left" ? "hidden" : "flex-1"} ${
                    theme === "dark" ? "bg-[#1a1c1e]" : "bg-[#F7F5F2]"
                  }`}
                >
                  <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />
                  {/* Toolbar */}
                  <header
                    className={`flex shrink-0 h-10 items-center border-b px-4 transition-colors duration-300 space-x-4 ${
                      theme === "dark"
                        ? "bg-[#232527] border-[#2d2f31]"
                        : "bg-[#f0f2f5] border-[#dce0e5]"
                    }`}
                  >
                    {selectedNews && (
                      <div className="flex items-center space-x-4 flex-1">
                        <div className={`flex items-center p-1 rounded-lg border shadow-sm ${
                          theme === "dark"
                            ? "bg-[#1a1c1e] border-[#2d2f31]"
                            : "bg-gray-100/50 border-gray-200"
                        }`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewMode("desktop");
                            }}
                            className={`p-2 rounded-lg transition-all ${
                              previewMode === "desktop"
                                ? "bg-[#009f75] text-white shadow-md"
                                : theme === "dark"
                                  ? "text-gray-400 hover:text-gray-200 hover:bg-[#252729]"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            }`}
                            title="Desktop Preview"
                          >
                            <Monitor size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewMode("whatsapp");
                            }}
                            className={`p-2 rounded-lg transition-all ${
                              previewMode === "whatsapp"
                                ? "bg-[#009f75] text-white shadow-md"
                                : theme === "dark"
                                  ? "text-gray-400 hover:text-gray-200 hover:bg-[#252729]"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            }`}
                            title="WhatsApp Preview"
                          >
                            <MessageSquare size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewMode("image");
                            }}
                            className={`p-2 rounded-lg transition-all ${
                              previewMode === "image"
                                ? "bg-[#009f75] text-white shadow-md"
                                : theme === "dark"
                                  ? "text-gray-400 hover:text-gray-200 hover:bg-[#252729]"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            }`}
                            title="Image Preview"
                          >
                            <ImageIcon size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewMode("raw");
                            }}
                            className={`p-2 rounded-lg transition-all ${
                              previewMode === "raw"
                                ? "bg-[#009f75] text-white shadow-md"
                                : theme === "dark"
                                  ? "text-gray-400 hover:text-gray-200 hover:bg-[#252729]"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            }`}
                            title="Raw Content"
                          >
                            <FileText size={16} />
                          </button>
                        </div>

                        <div className="flex-1" />

                        <div className={`flex items-center space-x-2 rounded-full px-3 py-1 shadow-sm border ${
                          theme === "dark"
                            ? "bg-[#1a1c1e] border-[#2d2f31]"
                            : "bg-white border-gray-200"
                        }`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewsZoom(Math.max(0.5, newsZoom - 0.1));
                            }}
                            className={`p-1 rounded-full transition-colors ${
                              theme === "dark"
                                ? "hover:bg-[#252729] text-gray-400 hover:text-gray-200"
                                : "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            <ZoomOut size={14} />
                          </button>
                          <span className={`text-[10px] font-bold w-8 text-center ${
                            theme === "dark" ? "text-gray-300" : "text-gray-400"
                          }`}>
                            {Math.round(newsZoom * 100)}%
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewsZoom(Math.min(2, newsZoom + 0.1));
                            }}
                            className={`p-1 rounded-full transition-colors ${
                              theme === "dark"
                                ? "hover:bg-[#252729] text-gray-400 hover:text-gray-200"
                                : "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            <ZoomIn size={14} />
                          </button>
                        </div>

                        <div
                          className={`h-4 w-[1px] ${theme === "dark" ? "bg-white/10" : "bg-gray-300"}`}
                        />
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
                            {selectedNews.summary_en ||
                            isRefining ||
                            previewMode === "raw" ||
                            previewMode === "image" ? (
                              previewMode === "raw" ? (
                                <div className="flex flex-col space-y-6">
                                  <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">
                                      Source Material
                                    </h3>
                                  </div>
                                  <div
                                    className={`p-8 rounded-3xl border-2 transition-all duration-300 ${
                                      theme === "dark"
                                        ? "bg-[#232527] border-[#2d2f31] shadow-none"
                                        : "bg-white border-gray-100 shadow-xl shadow-gray-200/50"
                                    }`}
                                    style={{
                                      fontSize: `${14 * newsZoom}px`,
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    <p className={`whitespace-pre-wrap font-medium ${
                                      theme === "dark" ? "text-gray-200" : "text-gray-800"
                                    }`}>
                                      {selectedNews.raw_text}
                                    </p>

                                    {selectedNews.images &&
                                      selectedNews.images.length > 0 && (
                                        <div className="mt-8 grid grid-cols-2 gap-4">
                                          {selectedNews.images.map(
                                            (img, idx) => (
                                              <div
                                                key={idx}
                                                className={`relative group rounded-2xl overflow-hidden border shadow-sm transition-all hover:shadow-md ${
                                                  theme === "dark" ? "border-gray-800" : "border-gray-200"
                                                }`}
                                              >
                                                <img
                                                  src={img}
                                                  alt={`Source Attachment ${idx + 1}`}
                                                  className="w-full h-auto cursor-zoom-in"
                                                  onClick={() =>
                                                    window.open(img, "_blank")
                                                  }
                                                />
                                              </div>
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </div>
                                </div>
                              ) : previewMode === "whatsapp" ? (
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
                                      <ArrowLeft
                                        size={20}
                                        className="text-white"
                                      />
                                      <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden border border-white/20">
                                        <div className="w-full h-full bg-green-100 flex items-center justify-center text-green-800 font-bold">
                                          MI
                                        </div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold truncate">
                                          Market Intelligence
                                        </h3>
                                        <p className="text-[10px] text-white/80">
                                          online
                                        </p>
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
                                          <span className="bg-[#D1E4F0] text-[10px] font-bold text-gray-600 px-3 py-1 rounded-lg uppercase shadow-sm">
                                            Today
                                          </span>
                                        </div>
                                        <div className="max-w-[92%] self-start bg-white rounded-lg rounded-tl-none shadow-sm p-3 relative">
                                          <div
                                            className="absolute top-0 -left-2 w-2 h-3 bg-white"
                                            style={{
                                              clipPath:
                                                "polygon(100% 0, 0 0, 100% 100%)",
                                            }}
                                          ></div>

                                          {isRefining ? (
                                            <div className="flex flex-col items-center justify-center py-8 space-y-4">
                                              <div className="relative">
                                                <Loader2
                                                  size={32}
                                                  className="animate-spin text-green-600"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                  <Sparkles
                                                    size={12}
                                                    className="text-green-800 animate-pulse"
                                                  />
                                                </div>
                                              </div>
                                              <div className="flex flex-col items-center">
                                                <span className="text-[11px] font-bold text-gray-600 animate-pulse">
                                                  Gemini is synthesizing...
                                                </span>
                                                <div className="flex space-x-1 mt-1">
                                                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <>
                                              {getRefinedImageDetails(
                                                selectedNews.summary_en,
                                              ) ||
                                              getRefinedImageDetails(
                                                selectedNews.summary_hi,
                                              ) ? (
                                                <div className="text-[13px] leading-relaxed text-gray-800 font-sans p-1 text-center py-6 space-y-3">
                                                  <div className="text-2xl">
                                                    🎨
                                                  </div>
                                                  <p className="font-bold text-gray-950 leading-tight">
                                                    Visual Concept Generated
                                                  </p>
                                                  <p className="text-gray-500 text-xs leading-normal">
                                                    This news item has been
                                                    refined into an AI graphic.
                                                    Standard chat view only
                                                    displays text summaries.
                                                  </p>
                                                  <button
                                                    onClick={() =>
                                                      setPreviewMode("image")
                                                    }
                                                    className="px-3.5 py-1.5 bg-[#128C7E] hover:bg-[#0b655a] text-white text-[11px] font-bold rounded-md shadow-sm transition-all inline-flex items-center space-x-1"
                                                  >
                                                    <ImageIcon
                                                      size={11}
                                                      className="mr-0.5"
                                                    />
                                                    <span>
                                                      Switch to Image Tab
                                                    </span>
                                                  </button>
                                                </div>
                                              ) : (
                                                <>
                                                  {/* Copy Button */}
                                                  <motion.button
                                                    whileTap={{ scale: 0.85 }}
                                                    whileHover={{ scale: 1.05 }}
                                                    onClick={() => {
                                                      const { header, footer } =
                                                        getHFSettings(
                                                          selectedNews.category_id,
                                                        );
                                                      const en =
                                                        selectedNews.summary_en ||
                                                        "";
                                                      const hi =
                                                        selectedNews.summary_hi ||
                                                        "";
                                                      const content =
                                                        en === hi
                                                          ? en
                                                          : refineOptions.order ===
                                                              "hi-en"
                                                            ? `${hi}${hi && en ? "\n\n" : ""}${en}`
                                                            : `${en}${en && hi ? "\n\n" : ""}${hi}`;
                                                      const textToCopy =
                                                        `${header ? header + "\n\n" : ""}${content}${footer ? "\n\n" + footer : ""}`.trim();
                                                      handleCopy(
                                                        "news",
                                                        selectedNews.id,
                                                        textToCopy,
                                                      );
                                                    }}
                                                    className={`absolute top-1 right-1 p-1.5 rounded-md z-20 overflow-hidden relative cursor-pointer select-none transition-colors ${
                                                      selectedNews.is_copied
                                                        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-805 dark:text-gray-400 dark:hover:bg-gray-700"
                                                    }`}
                                                    title="Copy to WhatsApp"
                                                  >
                                                    <AnimatePresence mode="wait">
                                                      {justCopiedId?.startsWith(
                                                        `news-${selectedNews.id}`,
                                                      ) ? (
                                                        <motion.span
                                                          key="success-pop"
                                                          initial={{
                                                            scale: 0.5,
                                                            opacity: 0,
                                                          }}
                                                          animate={{
                                                            scale: 1,
                                                            opacity: 1,
                                                          }}
                                                          exit={{
                                                            scale: 0.5,
                                                            opacity: 0,
                                                          }}
                                                          className="flex items-center justify-center text-green-650 dark:text-green-400 font-bold"
                                                        >
                                                          <Check
                                                            size={14}
                                                            className="stroke-[3]"
                                                          />
                                                        </motion.span>
                                                      ) : (
                                                        <motion.span
                                                          key="normal-icon"
                                                          initial={{
                                                            scale: 0.8,
                                                            opacity: 0,
                                                          }}
                                                          animate={{
                                                            scale: 1,
                                                            opacity: 1,
                                                          }}
                                                          exit={{
                                                            scale: 0.8,
                                                            opacity: 0,
                                                          }}
                                                          className="flex items-center justify-center"
                                                        >
                                                          {selectedNews.is_copied ? (
                                                            <Check size={14} />
                                                          ) : (
                                                            <Copy size={14} />
                                                          )}
                                                        </motion.span>
                                                      )}
                                                    </AnimatePresence>

                                                    {/* Dynamic ripple overlay triggered on click */}
                                                    <AnimatePresence>
                                                      {justCopiedId?.startsWith(
                                                        `news-${selectedNews.id}`,
                                                      ) && (
                                                        <motion.span
                                                          initial={{
                                                            opacity: 0.35,
                                                            scale: 0.4,
                                                          }}
                                                          animate={{
                                                            opacity: 0,
                                                            scale: 2.2,
                                                          }}
                                                          exit={{ opacity: 0 }}
                                                          transition={{
                                                            duration: 0.45,
                                                            ease: "easeOut",
                                                          }}
                                                          className="absolute inset-0 bg-green-500 rounded-full pointer-events-none"
                                                        />
                                                      )}
                                                    </AnimatePresence>
                                                  </motion.button>

                                                  <div className="text-[14px] leading-relaxed text-gray-800 font-sans">
                                                    <div
                                                      className={`${!isWhatsAppExpanded ? "line-clamp-[15]" : ""} transition-all duration-300`}
                                                    >
                                                      <Markdown>
                                                        {formatForMarkdownPreview(
                                                          (() => {
                                                            const {
                                                              header,
                                                              footer,
                                                            } = getHFSettings(
                                                              selectedNews.category_id,
                                                            );
                                                            const en =
                                                              selectedNews.summary_en ||
                                                              "";
                                                            const hi =
                                                              selectedNews.summary_hi ||
                                                              "";
                                                            const content =
                                                              en === hi
                                                                ? en
                                                                : refineOptions.order ===
                                                                    "hi-en"
                                                                  ? `${hi}${hi && en ? "\n\n" : ""}${en}`
                                                                  : `${en}${en && hi ? "\n\n" : ""}${hi}`;

                                                            return `${header ? header + "\n\n" : ""}${content}${footer ? "\n\n" + footer : ""}`.trim();
                                                          })(),
                                                        )}
                                                      </Markdown>
                                                    </div>
                                                    <button
                                                      onClick={() =>
                                                        setIsWhatsAppExpanded(
                                                          !isWhatsAppExpanded,
                                                        )
                                                      }
                                                      className="mt-2 text-[#34B7F1] font-bold text-xs hover:underline flex items-center space-x-1"
                                                    >
                                                      <span>
                                                        {isWhatsAppExpanded
                                                          ? "Read Less"
                                                          : "Read More..."}
                                                      </span>
                                                    </button>
                                                  </div>
                                                </>
                                              )}
                                            </>
                                          )}
                                          <div className="flex justify-end items-center space-x-1 mt-1">
                                            <span className="text-[9px] text-gray-400">
                                              {new Date().toLocaleTimeString(
                                                [],
                                                {
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                },
                                              )}
                                            </span>
                                            <div className="flex">
                                              <Check
                                                size={10}
                                                className="text-[#34B7F1]"
                                              />
                                              <Check
                                                size={10}
                                                className="text-[#34B7F1] -ml-1"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* WhatsApp Input Area */}
                                    <div className="bg-[#F0F2F5] p-2 flex items-center space-x-2">
                                      <div className="flex-1 bg-white rounded-full px-4 py-2 flex items-center space-x-2 shadow-sm">
                                        <Smile
                                          size={20}
                                          className="text-gray-500"
                                        />
                                        <div className="flex-1 text-gray-400 text-sm">
                                          Message
                                        </div>
                                        <Paperclip
                                          size={20}
                                          className="text-gray-500"
                                        />
                                        <Camera
                                          size={20}
                                          className="text-gray-500"
                                        />
                                      </div>
                                      <div className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center text-white shadow-md">
                                        <Mic size={20} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : previewMode === "image" ? (
                                <div
                                  className="flex flex-col items-center justify-center space-y-6 transition-all duration-300 w-full"
                                  style={{ zoom: newsZoom }}
                                >
                                  {(() => {
                                    const imgDetails =
                                      getRefinedImageDetails(
                                        selectedNews.summary_en,
                                      ) ||
                                      getRefinedImageDetails(
                                        selectedNews.summary_hi,
                                      );
                                    if (imgDetails) {
                                      return (
                                        <div className="w-full max-w-xl bg-white p-6 rounded-[32px] overflow-hidden shadow-sm border border-gray-100 flex flex-col space-y-6 animate-in fade-in duration-300">
                                          {/* Top header on card */}
                                          <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                                            <div className="flex items-center space-x-2">
                                              <div className="p-1 px-2.5 bg-green-50 text-[#009f75] text-[10px] font-black uppercase tracking-wider rounded-md">
                                                AI Render
                                              </div>
                                              <span className="text-[11px] text-gray-400 font-bold">
                                                News #{selectedNews.id}
                                              </span>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                              <a
                                                href={imgDetails.url}
                                                target="_blank"
                                                rel="noopener noreferrer nofollow"
                                                className="p-1.5 bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200/60 rounded-lg hover:bg-gray-100 transition-all font-bold text-xs flex items-center space-x-1"
                                              >
                                                <ImageIcon
                                                  size={12}
                                                  className="text-gray-400 mr-0.5"
                                                />
                                                <span>Open Image</span>
                                              </a>
                                            </div>
                                          </div>

                                          {/* The actual image */}
                                          <div className="relative group rounded-2xl overflow-hidden border border-gray-100 bg-gray-50/50 flex justify-center items-center">
                                            <img
                                              src={imgDetails.url}
                                              alt={
                                                imgDetails.alt ||
                                                "AI Rendered Market Graphic"
                                              }
                                              referrerPolicy="no-referrer"
                                              className="max-h-[420px] object-contain w-full rounded-2xl transition-transform duration-300 group-hover:scale-[1.01]"
                                            />
                                          </div>

                                          {/* The Caption */}
                                          {imgDetails.caption && (
                                            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100/80">
                                              <div className="prose prose-sm max-w-none text-gray-600 text-sm leading-relaxed italic">
                                                <Markdown>
                                                  {formatForMarkdownPreview(
                                                    imgDetails.caption,
                                                  )}
                                                </Markdown>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <div className="space-y-6 bg-white p-10 rounded-[32px] shadow-sm border border-[#e5e7eb] text-center max-w-md mx-auto py-16 animate-in fade-in duration-300">
                                          <div className="bg-amber-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-amber-600 border border-amber-100 shadow-sm mb-4">
                                            <ImageIcon size={32} />
                                          </div>
                                          <div className="space-y-2">
                                            <h3 className="text-lg font-bold text-gray-900">
                                              Text Synthesis Only
                                            </h3>
                                            <p className="text-sm text-gray-500 leading-relaxed">
                                              This intelligence has been refined
                                              in <strong>Text Mode</strong>. No
                                              visual graphic was generated.
                                            </p>
                                            <p className="text-xs text-paragraph text-gray-400 max-w-xs mx-auto leading-relaxed pt-1">
                                              To render a custom visual graphic,
                                              please toggle the{" "}
                                              <strong>Refinement Focus</strong>{" "}
                                              type to <strong>Image</strong> at
                                              the top-left of the toolbar and
                                              click <strong>Refine</strong>.
                                            </p>
                                            <div className="pt-5 flex justify-center space-x-3">
                                              <button
                                                onClick={() =>
                                                  setPreviewMode("desktop")
                                                }
                                                className="px-4 py-2 bg-gray-150 hover:bg-gray-200 text-gray-750 text-xs font-bold rounded-xl transition-all border border-gray-200"
                                              >
                                                Desktop Preview
                                              </button>
                                              <button
                                                onClick={() =>
                                                  setPreviewMode("whatsapp")
                                                }
                                                className="px-4 py-2 bg-gray-150 hover:bg-gray-200 text-gray-750 text-xs font-bold rounded-xl transition-all border border-gray-200"
                                              >
                                                WhatsApp Preview
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }
                                  })()}
                                </div>
                              ) : (
                                <div
                                  className="space-y-8 animate-in fade-in duration-500 origin-top transition-transform"
                                  style={{ zoom: newsZoom }}
                                >
                                  {isRefining ? (
                                    <div className="flex flex-col items-center justify-center py-24 space-y-6 bg-white rounded-3xl border-2 border-gray-100 shadow-sm">
                                      <div className="relative">
                                        <Loader2
                                          size={48}
                                          className="animate-spin text-green-600"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <Sparkles
                                            size={18}
                                            className="text-green-800 animate-pulse"
                                          />
                                        </div>
                                      </div>
                                      <div className="text-center space-y-2">
                                        <h3 className="text-lg font-bold text-gray-900">
                                          Synthesizing Intelligence...
                                        </h3>
                                        <p className="text-sm text-gray-500 italic">
                                          Gemini is applying market logic and
                                          cross-referencing data points.
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      {getRefinedImageDetails(
                                        selectedNews.summary_en,
                                      ) ||
                                      getRefinedImageDetails(
                                        selectedNews.summary_hi,
                                      ) ? (
                                        <div className="space-y-6 bg-white p-10 rounded-[32px] shadow-sm border border-gray-100 text-center max-w-xl mx-auto py-16 animate-in fade-in duration-300">
                                          <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-[#009f75] border border-green-100 shadow-sm mb-4">
                                            <ImageIcon size={32} />
                                          </div>
                                          <div className="space-y-2">
                                            <h3 className="text-lg font-bold text-[#009f75]">
                                              Visual Synthesis Rendered
                                            </h3>
                                            <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
                                              This intelligence was refined as a
                                              visual concept. The generated
                                              high-resolution market graphic and
                                              footnotes are available in the{" "}
                                              <strong>Image Preview</strong>{" "}
                                              tab.
                                            </p>
                                            <div className="pt-4 flex justify-center">
                                              <button
                                                onClick={() =>
                                                  setPreviewMode("image")
                                                }
                                                className="px-5 py-2.5 bg-[#009f75] hover:bg-[#008f65] text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md shadow-green-200"
                                              >
                                                <ImageIcon
                                                  size={14}
                                                  className="mr-0.5"
                                                />
                                                <span>
                                                  Switch to Image Preview
                                                </span>
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ) : refineOptions.order === "hi-en" ? (
                                        <div className={`rounded-[32px] shadow-sm border overflow-hidden flex flex-col animate-in fade-in duration-300 ${
                                          theme === "dark"
                                            ? "bg-[#232527] border-[#2d2f31]"
                                            : "bg-white border-gray-100"
                                        }`}>
                                          {/* Distinct Option Bar at the Upper Edge */}
                                          <div className="bg-gray-50/75 dark:bg-[#1f2022] px-8 md:px-10 py-4 border-b border-gray-100 dark:border-gray-800">
                                            <div className="flex items-center justify-between">
                                              {/* Left Side: Iterative Correction / Regenerate Trigger */}
                                              <div>
                                                {selectedNews.type ===
                                                  "refined" && (
                                                  <button
                                                    onClick={() =>
                                                      setIsRegenOpen(
                                                        !isRegenOpen,
                                                      )
                                                    }
                                                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl border text-[11px] font-bold tracking-wide uppercase transition-all duration-300 transform active:scale-95 cursor-pointer select-none ${
                                                      isRegenOpen
                                                        ? "bg-gradient-to-r from-[#009f75] to-teal-600 text-white border-transparent shadow-[#009f75]/25 shadow-md"
                                                        : "bg-gray-50 border-gray-200 text-gray-500 hover:text-[#009f75] hover:border-gray-300 hover:shadow-sm"
                                                    }`}
                                                    title="Request custom modifications to this synthesis"
                                                  >
                                                    <Sparkles
                                                      size={11}
                                                      className={
                                                        isRegenOpen
                                                          ? "animate-pulse"
                                                          : ""
                                                      }
                                                    />
                                                    <span>Regenerate</span>
                                                  </button>
                                                )}
                                              </div>

                                              {/* Right Side: Clipboard and actions */}
                                              <div className="flex items-center space-x-3">
                                                <motion.button
                                                  whileTap={{ scale: 0.92 }}
                                                  whileHover={{ scale: 1.02 }}
                                                  onClick={() => {
                                                    const { header, footer } =
                                                      getHFSettings(
                                                        selectedNews.category_id,
                                                      );
                                                    const en =
                                                      selectedNews.summary_en ||
                                                      "";
                                                    const hi =
                                                      selectedNews.summary_hi ||
                                                      "";
                                                    const content =
                                                      en === hi
                                                        ? en
                                                        : refineOptions.order ===
                                                            "hi-en"
                                                          ? `${hi}${hi && en ? "\n\n" : ""}${en}`
                                                          : `${en}${en && hi ? "\n\n" : ""}${hi}`;
                                                    const textToCopy =
                                                      `${header ? header + "\n\n" : ""}${content}${footer ? "\n\n" + footer : ""}`.trim();
                                                    handleCopy(
                                                      "news",
                                                      selectedNews.id,
                                                      textToCopy,
                                                    );
                                                  }}
                                                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all relative overflow-hidden cursor-pointer select-none ${
                                                    selectedNews.is_copied
                                                      ? "bg-green-50 text-green-600 border border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30"
                                                      : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-155 dark:bg-[#252729] dark:text-gray-400 dark:hover:bg-[#2d3032] dark:border-gray-800 shadow-sm"
                                                  }`}
                                                  title={
                                                    selectedNews.is_copied
                                                      ? "Copied"
                                                      : "Copy for WhatsApp"
                                                  }
                                                >
                                                  <AnimatePresence mode="wait">
                                                    {justCopiedId?.startsWith(
                                                      `news-${selectedNews.id}`,
                                                    ) ? (
                                                      <motion.div
                                                        key="success-pop-2"
                                                        initial={{
                                                          scale: 0.6,
                                                          opacity: 0,
                                                        }}
                                                        animate={{
                                                          scale: 1,
                                                          opacity: 1,
                                                        }}
                                                        exit={{
                                                          scale: 0.6,
                                                          opacity: 0,
                                                        }}
                                                        className="flex items-center space-x-1"
                                                      >
                                                        <Check
                                                          size={13}
                                                          className="stroke-[3] text-green-650 dark:text-green-400"
                                                        />
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-green-650 dark:text-green-400">
                                                          Copied!
                                                        </span>
                                                      </motion.div>
                                                    ) : (
                                                      <motion.div
                                                        key="normal-icon-2"
                                                        initial={{
                                                          scale: 0.9,
                                                          opacity: 0,
                                                        }}
                                                        animate={{
                                                          scale: 1,
                                                          opacity: 1,
                                                        }}
                                                        exit={{
                                                          scale: 0.9,
                                                          opacity: 0,
                                                        }}
                                                        className="flex items-center space-x-1"
                                                      >
                                                        {selectedNews.is_copied ? (
                                                          <Check size={13} />
                                                        ) : (
                                                          <Copy size={13} />
                                                        )}
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">
                                                          {selectedNews.is_copied
                                                            ? "Copied"
                                                            : "Copy"}
                                                        </span>
                                                      </motion.div>
                                                    )}
                                                  </AnimatePresence>

                                                  {/* Wave ripple inside button on press to signify action */}
                                                  <AnimatePresence>
                                                    {justCopiedId?.startsWith(
                                                      `news-${selectedNews.id}`,
                                                    ) && (
                                                      <motion.span
                                                        initial={{
                                                          opacity: 0.6,
                                                          scale: 0,
                                                        }}
                                                        animate={{
                                                          opacity: 0,
                                                          scale: 2.2,
                                                        }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{
                                                          duration: 0.4,
                                                          ease: "easeOut",
                                                        }}
                                                        className="absolute inset-0 bg-green-500 rounded-full pointer-events-none animate-none"
                                                      />
                                                    )}
                                                  </AnimatePresence>
                                                </motion.button>
                                              </div>
                                            </div>

                                            {/* Slide-out block for Corrective Instructions */}
                                            <AnimatePresence>
                                              {isRegenOpen && (
                                                <motion.div
                                                  initial={{
                                                    opacity: 0,
                                                    height: 0,
                                                    marginTop: 0,
                                                  }}
                                                  animate={{
                                                    opacity: 1,
                                                    height: "auto",
                                                    marginTop: 12,
                                                  }}
                                                  exit={{
                                                    opacity: 0,
                                                    height: 0,
                                                    marginTop: 0,
                                                  }}
                                                  className="overflow-hidden"
                                                  transition={{
                                                    duration: 0.25,
                                                    ease: "easeInOut",
                                                  }}
                                                >
                                                  <div
                                                    onDragOver={handleCorrectionImageDragOver}
                                                    onDrop={handleCorrectionImageDrop}
                                                    className="bg-white dark:bg-[#2c2e30] p-3 rounded-2xl border border-gray-150 dark:border-gray-700 flex flex-col space-y-2 shadow-inner"
                                                  >
                                                    <div className="flex items-center space-x-2 text-[10px] font-black uppercase text-[#009f75] tracking-wider px-1 pt-1 mb-1">
                                                      <span>💡 Phase 3: Multi-Turn Refinement Engine</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2 w-full">
                                                      <input
                                                        type="text"
                                                        value={regenInstruction}
                                                        onChange={(e) =>
                                                          setRegenInstruction(
                                                            e.target.value,
                                                          )
                                                        }
                                                        onPaste={handleCorrectionImagePaste}
                                                        placeholder="Write corrective feedback or paste images..."
                                                        onKeyDown={(e) => {
                                                          if (e.key === "Enter")
                                                            handleRegenerateRefinement();
                                                        }}
                                                        className="flex-1 bg-gray-50 dark:bg-[#1f2022] text-xs px-3.5 py-2.5 rounded-xl border border-gray-150 dark:border-gray-800 focus:outline-none focus:border-[#009f75] text-gray-800 dark:text-gray-100 placeholder-gray-400"
                                                        disabled={isRegenerating}
                                                      />
                                                      
                                                      <input
                                                        type="file"
                                                        ref={correctionFileRef}
                                                        className="hidden"
                                                        accept="image/*"
                                                        multiple
                                                        onChange={handleCorrectionImageUpload}
                                                      />
                                                      
                                                      <button
                                                        type="button"
                                                        onClick={() => correctionFileRef.current?.click()}
                                                        className="relative p-2 rounded-xl text-gray-400 hover:text-[#009f75] hover:bg-gray-50 dark:hover:bg-[#1f2022] transition-colors cursor-pointer flex items-center justify-center border-0 bg-transparent animate-none"
                                                        title="Attach feedback image"
                                                      >
                                                        <ImageIcon size={16} />
                                                        {correctionImages.length > 0 && (
                                                          <span className="absolute -top-1 -right-1 bg-[#009f75] text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-gray-700">
                                                            {correctionImages.length}
                                                          </span>
                                                        )}
                                                      </button>

                                                      <button
                                                        onClick={
                                                          handleRegenerateRefinement
                                                        }
                                                        disabled={
                                                          isRegenerating ||
                                                          (!regenInstruction.trim() && correctionImages.length === 0)
                                                        }
                                                        className="h-9 px-3 rounded-xl bg-gradient-to-r from-[#009f75] to-teal-650 hover:from-[#008f65] hover:to-teal-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm disabled:opacity-45 disabled:cursor-not-allowed transition-all cursor-pointer animate-none"
                                                        title="Regenerate refinement"
                                                      >
                                                        {isRegenerating ? (
                                                          <Loader2
                                                            size={13}
                                                            className="animate-spin"
                                                          />
                                                        ) : (
                                                          <>
                                                            <Sparkles size={11} />
                                                            <span>Apply</span>
                                                          </>
                                                        )}
                                                      </button>
                                                    </div>

                                                    {correctionImages.length > 0 && (
                                                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                                                        {correctionImages.map((img, idx) => (
                                                          <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-750 group bg-gray-50 dark:bg-gray-800 shadow-sm">
                                                            <img src={img} className="w-full h-full object-cover" alt="Correction attachment" referrerPolicy="no-referrer" />
                                                            <button
                                                              type="button"
                                                              onClick={() => setCorrectionImages((prev) => prev.filter((_, i) => i !== idx))}
                                                              className="absolute top-0.5 right-0.5 bg-black/75 hover:bg-black/90 text-white rounded-full p-0.5 opacity-90 hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center animate-none"
                                                              title="Remove image"
                                                            >
                                                              <Trash2 size={10} />
                                                            </button>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>

                                          <div className="p-8 md:p-10 space-y-6">
                                            {(() => {
                                              const { header, footer } =
                                                getHFSettings(
                                                  selectedNews.category_id,
                                                );
                                              return (
                                                <>
                                                  {header && (
                                                    <div className="prose prose-sm max-w-none pb-4 border-b border-gray-50 italic text-gray-500 text-sm">
                                                      <Markdown>
                                                        {formatForMarkdownPreview(
                                                          header,
                                                        )}
                                                      </Markdown>
                                                    </div>
                                                  )}

                                                  <div className="prose prose-sm max-w-none">
                                                    {selectedNews.summary_hi ? (
                                                      <div className={`font-sans text-[15px] leading-relaxed ${
                                                        theme === "dark" ? "text-gray-200" : "text-gray-900"
                                                      }`}>
                                                        <Markdown>
                                                          {formatForMarkdownPreview(
                                                            selectedNews.summary_hi,
                                                          )}
                                                        </Markdown>
                                                      </div>
                                                    ) : (
                                                      <p className={`italic font-sans text-[15px] leading-relaxed ${
                                                        theme === "dark" ? "text-gray-400" : "text-gray-500"
                                                      }`}>
                                                        प्रसंस्करण के बाद यहां
                                                        अनुवाद दिखाई देगा...
                                                      </p>
                                                    )}
                                                  </div>
                                                  {selectedNews.summary_en !==
                                                    selectedNews.summary_hi && (
                                                    <div className="prose prose-sm max-w-none">
                                                      <div className={`font-sans text-[15px] leading-relaxed ${
                                                        theme === "dark" ? "text-gray-200" : "text-gray-900"
                                                      }`}>
                                                        <Markdown>
                                                          {formatForMarkdownPreview(
                                                            selectedNews.summary_en,
                                                          )}
                                                        </Markdown>
                                                      </div>
                                                    </div>
                                                  )}

                                                  {footer && (
                                                    <div className="prose prose-sm max-w-none pt-4 border-t border-gray-50 italic text-gray-500 text-sm">
                                                      <Markdown>
                                                        {formatForMarkdownPreview(
                                                          footer,
                                                        )}
                                                      </Markdown>
                                                    </div>
                                                  )}
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className={`rounded-[32px] shadow-sm border overflow-hidden flex flex-col animate-in fade-in duration-300 ${
                                          theme === "dark"
                                            ? "bg-[#232527] border-[#2d2f31]"
                                            : "bg-white border-gray-100"
                                        }`}>
                                          {/* Distinct Option Bar at the Upper Edge */}
                                          <div className="bg-gray-50/75 dark:bg-[#1f2022] px-8 md:px-10 py-4 border-b border-gray-100 dark:border-gray-800">
                                            <div className="flex items-center justify-between">
                                              {/* Left Side: Iterative Correction / Regenerate Trigger */}
                                              <div>
                                                {selectedNews.type ===
                                                  "refined" && (
                                                  <button
                                                    onClick={() =>
                                                      setIsRegenOpen(
                                                        !isRegenOpen,
                                                      )
                                                    }
                                                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl border text-[11px] font-bold tracking-wide uppercase transition-all duration-300 transform active:scale-95 cursor-pointer select-none ${
                                                      isRegenOpen
                                                        ? "bg-gradient-to-r from-[#009f75] to-teal-600 text-white border-transparent shadow-[#009f75]/25 shadow-md"
                                                        : "bg-gray-50 border-gray-200 text-gray-500 hover:text-[#009f75] hover:border-gray-300 hover:shadow-sm"
                                                    }`}
                                                    title="Request custom modifications to this synthesis"
                                                  >
                                                    <Sparkles
                                                      size={11}
                                                      className={
                                                        isRegenOpen
                                                          ? "animate-pulse"
                                                          : ""
                                                      }
                                                    />
                                                    <span>Regenerate</span>
                                                  </button>
                                                )}
                                              </div>

                                              {/* Right Side: Clipboard and actions */}
                                              <div className="flex items-center space-x-3">
                                                <motion.button
                                                  whileTap={{ scale: 0.92 }}
                                                  whileHover={{ scale: 1.02 }}
                                                  onClick={() => {
                                                    const { header, footer } =
                                                      getHFSettings(
                                                        selectedNews.category_id,
                                                      );
                                                    const en =
                                                      selectedNews.summary_en ||
                                                      "";
                                                    const hi =
                                                      selectedNews.summary_hi ||
                                                      "";
                                                    const content =
                                                      en === hi
                                                        ? en
                                                        : refineOptions.order ===
                                                            "hi-en"
                                                          ? `${hi}${hi && en ? "\n\n" : ""}${en}`
                                                          : `${en}${en && hi ? "\n\n" : ""}${hi}`;
                                                    const textToCopy =
                                                      `${header ? header + "\n\n" : ""}${content}${footer ? "\n\n" + footer : ""}`.trim();
                                                    handleCopy(
                                                      "news",
                                                      selectedNews.id,
                                                      textToCopy,
                                                    );
                                                  }}
                                                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all relative overflow-hidden cursor-pointer select-none ${
                                                    selectedNews.is_copied
                                                      ? "bg-green-50 text-green-600 border border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30"
                                                      : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-155 dark:bg-[#252729] dark:text-gray-400 dark:hover:bg-[#2d3032] dark:border-gray-800 shadow-sm"
                                                  }`}
                                                  title={
                                                    selectedNews.is_copied
                                                      ? "Copied"
                                                      : "Copy for WhatsApp"
                                                  }
                                                >
                                                  <AnimatePresence mode="wait">
                                                    {justCopiedId?.startsWith(
                                                      `news-${selectedNews.id}`,
                                                    ) ? (
                                                      <motion.div
                                                        key="success-pop-3"
                                                        initial={{
                                                          scale: 0.6,
                                                          opacity: 0,
                                                        }}
                                                        animate={{
                                                          scale: 1,
                                                          opacity: 1,
                                                        }}
                                                        exit={{
                                                          scale: 0.6,
                                                          opacity: 0,
                                                        }}
                                                        className="flex items-center space-x-1"
                                                      >
                                                        <Check
                                                          size={13}
                                                          className="stroke-[3] text-green-650 dark:text-green-400"
                                                        />
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-green-650 dark:text-green-400">
                                                          Copied!
                                                        </span>
                                                      </motion.div>
                                                    ) : (
                                                      <motion.div
                                                        key="normal-icon-3"
                                                        initial={{
                                                          scale: 0.9,
                                                          opacity: 0,
                                                        }}
                                                        animate={{
                                                          scale: 1,
                                                          opacity: 1,
                                                        }}
                                                        exit={{
                                                          scale: 0.9,
                                                          opacity: 0,
                                                        }}
                                                        className="flex items-center space-x-1"
                                                      >
                                                        {selectedNews.is_copied ? (
                                                          <Check size={13} />
                                                        ) : (
                                                          <Copy size={13} />
                                                        )}
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">
                                                          {selectedNews.is_copied
                                                            ? "Copied"
                                                            : "Copy"}
                                                        </span>
                                                      </motion.div>
                                                    )}
                                                  </AnimatePresence>

                                                  {/* Wave ripple inside button on press to signify action */}
                                                  <AnimatePresence>
                                                    {justCopiedId?.startsWith(
                                                      `news-${selectedNews.id}`,
                                                    ) && (
                                                      <motion.span
                                                        initial={{
                                                          opacity: 0.6,
                                                          scale: 0,
                                                        }}
                                                        animate={{
                                                          opacity: 0,
                                                          scale: 2.2,
                                                        }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{
                                                          duration: 0.4,
                                                          ease: "easeOut",
                                                        }}
                                                        className="absolute inset-0 bg-green-500 rounded-full pointer-events-none animate-none"
                                                      />
                                                    )}
                                                  </AnimatePresence>
                                                </motion.button>
                                              </div>
                                            </div>

                                            {/* Slide-out block for Corrective Instructions */}
                                            <AnimatePresence>
                                              {isRegenOpen && (
                                                <motion.div
                                                  initial={{
                                                    opacity: 0,
                                                    height: 0,
                                                    marginTop: 0,
                                                  }}
                                                  animate={{
                                                    opacity: 1,
                                                    height: "auto",
                                                    marginTop: 12,
                                                  }}
                                                  exit={{
                                                    opacity: 0,
                                                    height: 0,
                                                    marginTop: 0,
                                                  }}
                                                  className="overflow-hidden"
                                                  transition={{
                                                    duration: 0.25,
                                                    ease: "easeInOut",
                                                  }}
                                                >
                                                  <div
                                                    onDragOver={handleCorrectionImageDragOver}
                                                    onDrop={handleCorrectionImageDrop}
                                                    className="bg-white dark:bg-[#2c2e30] p-3 rounded-2xl border border-gray-150 dark:border-gray-700 flex flex-col space-y-2 shadow-inner"
                                                  >
                                                    <div className="flex items-center space-x-2 text-[10px] font-black uppercase text-[#009f75] tracking-wider px-1 pt-1 mb-1">
                                                      <span>💡 Phase 3: Multi-Turn Refinement Engine</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2 w-full">
                                                      <input
                                                        type="text"
                                                        value={regenInstruction}
                                                        onChange={(e) =>
                                                          setRegenInstruction(
                                                            e.target.value,
                                                          )
                                                        }
                                                        onPaste={handleCorrectionImagePaste}
                                                        placeholder="Write corrective feedback or paste images..."
                                                        onKeyDown={(e) => {
                                                          if (e.key === "Enter")
                                                            handleRegenerateRefinement();
                                                        }}
                                                        className="flex-1 bg-gray-50 dark:bg-[#1f2022] text-xs px-3.5 py-2.5 rounded-xl border border-gray-150 dark:border-gray-800 focus:outline-none focus:border-[#009f75] text-gray-800 dark:text-gray-100 placeholder-gray-400"
                                                        disabled={isRegenerating}
                                                      />
                                                      
                                                      <input
                                                        type="file"
                                                        ref={correctionFileRef}
                                                        className="hidden"
                                                        accept="image/*"
                                                        multiple
                                                        onChange={handleCorrectionImageUpload}
                                                      />
                                                      
                                                      <button
                                                        type="button"
                                                        onClick={() => correctionFileRef.current?.click()}
                                                        className="relative p-2 rounded-xl text-gray-400 hover:text-[#009f75] hover:bg-gray-50 dark:hover:bg-[#1f2022] transition-colors cursor-pointer flex items-center justify-center border-0 bg-transparent animate-none"
                                                        title="Attach feedback image"
                                                      >
                                                        <ImageIcon size={16} />
                                                        {correctionImages.length > 0 && (
                                                          <span className="absolute -top-1 -right-1 bg-[#009f75] text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-gray-700">
                                                            {correctionImages.length}
                                                          </span>
                                                        )}
                                                      </button>

                                                      <button
                                                        onClick={
                                                          handleRegenerateRefinement
                                                        }
                                                        disabled={
                                                          isRegenerating ||
                                                          (!regenInstruction.trim() && correctionImages.length === 0)
                                                        }
                                                        className="h-9 px-3 rounded-xl bg-gradient-to-r from-[#009f75] to-teal-650 hover:from-[#008f65] hover:to-teal-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm disabled:opacity-45 disabled:cursor-not-allowed transition-all cursor-pointer animate-none"
                                                        title="Regenerate refinement"
                                                      >
                                                        {isRegenerating ? (
                                                          <Loader2
                                                            size={13}
                                                            className="animate-spin"
                                                          />
                                                        ) : (
                                                          <>
                                                            <Sparkles size={11} />
                                                            <span>Apply</span>
                                                          </>
                                                        )}
                                                      </button>
                                                    </div>

                                                    {correctionImages.length > 0 && (
                                                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                                                        {correctionImages.map((img, idx) => (
                                                          <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-750 group bg-gray-50 dark:bg-gray-800 shadow-sm">
                                                            <img src={img} className="w-full h-full object-cover" alt="Correction attachment" referrerPolicy="no-referrer" />
                                                            <button
                                                              type="button"
                                                              onClick={() => setCorrectionImages((prev) => prev.filter((_, i) => i !== idx))}
                                                              className="absolute top-0.5 right-0.5 bg-black/75 hover:bg-black/90 text-white rounded-full p-0.5 opacity-90 hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center animate-none"
                                                              title="Remove image"
                                                            >
                                                              <Trash2 size={10} />
                                                            </button>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>

                                          <div className="p-8 md:p-10 space-y-6">
                                            {(() => {
                                              const { header, footer } =
                                                getHFSettings(
                                                  selectedNews.category_id,
                                                );
                                              return (
                                                <>
                                                  {header && (
                                                    <div className="prose prose-sm max-w-none pb-4 border-b border-gray-50 italic text-gray-500 text-sm">
                                                      <Markdown>
                                                        {formatForMarkdownPreview(
                                                          header,
                                                        )}
                                                      </Markdown>
                                                    </div>
                                                  )}

                                                  <div className="prose prose-sm max-w-none">
                                                    <div className={`font-sans text-[15px] leading-relaxed ${
                                                      theme === "dark" ? "text-gray-200" : "text-gray-900"
                                                    }`}>
                                                      <Markdown>
                                                        {formatForMarkdownPreview(
                                                          selectedNews.summary_en,
                                                        )}
                                                      </Markdown>
                                                    </div>
                                                  </div>
                                                  {selectedNews.summary_hi !==
                                                    selectedNews.summary_en && (
                                                    <div className="prose prose-sm max-w-none">
                                                      {selectedNews.summary_hi ? (
                                                        <div className={`font-sans text-[15px] leading-relaxed ${
                                                         theme === "dark" ? "text-gray-200" : "text-gray-900"
                                                       }`}>
                                                          <Markdown>
                                                            {formatForMarkdownPreview(
                                                              selectedNews.summary_hi,
                                                            )}
                                                          </Markdown>
                                                        </div>
                                                      ) : (
                                                        <p className={`italic font-sans text-[15px] leading-relaxed ${
                                                         theme === "dark" ? "text-gray-400" : "text-gray-500"
                                                       }`}>
                                                          प्रसंस्करण के बाद यहां
                                                          अनुवाद दिखाई देगा...
                                                        </p>
                                                      )}
                                                    </div>
                                                  )}

                                                  {footer && (
                                                    <div className="prose prose-sm max-w-none pt-4 border-t border-gray-50 italic text-gray-500 text-sm">
                                                      <Markdown>
                                                        {formatForMarkdownPreview(
                                                          footer,
                                                        )}
                                                      </Markdown>
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
                                  <h3 className="text-lg font-bold text-gray-900">
                                    Ready for Refinement
                                  </h3>
                                  <p className="text-sm text-gray-500 max-w-xs mx-auto">
                                    Configure your instructions above and click
                                    Refine to generate intelligence.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : selectedReport ? (
                      <div className="max-w-2xl mx-auto p-8">
                        <div className={`p-10 rounded-[32px] shadow-sm border flex flex-col space-y-8 ${
                          theme === "dark"
                            ? "bg-[#232527] border-[#2d2f31]"
                            : "bg-white border-gray-100"
                        }`}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-400 font-mono font-bold uppercase tracking-widest">
                                {selectedReport.type} Market Report
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                Generated:{" "}
                                {new Date(
                                  selectedReport.created_at,
                                ).toLocaleDateString()}
                              </span>
                            </div>
                            <motion.button
                              whileTap={{ scale: 0.92 }}
                              whileHover={{ scale: 1.02 }}
                              onClick={() => {
                                const { header, footer } = getHFSettings(
                                  selectedReport.category_id,
                                );
                                const en = selectedReport.content_en || "";
                                const hi = selectedReport.content_hi || "";
                                const content = `${en}\n\n${hi}`;
                                const textToCopy =
                                  `${header ? header + "\n\n" : ""}${content}${footer ? "\n\n" + footer : ""}`.trim();
                                handleCopy(
                                  "report",
                                  selectedReport.id,
                                  textToCopy,
                                );
                              }}
                              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all relative overflow-hidden cursor-pointer select-none ${
                                selectedReport.is_copied
                                  ? "bg-green-50 text-green-600 border border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30"
                                  : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-155 dark:bg-[#252729] dark:text-gray-400 dark:hover:bg-[#2d3032] dark:border-gray-800 shadow-sm"
                              }`}
                              title={
                                selectedReport.is_copied
                                  ? "Copied"
                                  : "Copy Report"
                              }
                            >
                              <AnimatePresence mode="wait">
                                {justCopiedId?.startsWith(
                                  `report-${selectedReport.id}`,
                                ) ? (
                                  <motion.div
                                    key="success-pop-4"
                                    initial={{ scale: 0.6, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.6, opacity: 0 }}
                                    className="flex items-center space-x-1"
                                  >
                                    <Check
                                      size={13}
                                      className="stroke-[3] text-green-650 dark:text-green-400"
                                    />
                                    <span className="text-[10px] font-black uppercase tracking-wider text-green-650 dark:text-green-400">
                                      Copied!
                                    </span>
                                  </motion.div>
                                ) : (
                                  <motion.div
                                    key="normal-icon-4"
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="flex items-center space-x-1"
                                  >
                                    {selectedReport.is_copied ? (
                                      <Check size={13} />
                                    ) : (
                                      <Copy size={13} />
                                    )}
                                    <span className="text-[10px] font-bold uppercase tracking-wider">
                                      {selectedReport.is_copied
                                        ? "Copied"
                                        : "Copy"}
                                    </span>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Wave ripple inside button on press to signify action */}
                              <AnimatePresence>
                                {justCopiedId?.startsWith(
                                  `report-${selectedReport.id}`,
                                ) && (
                                  <motion.span
                                    initial={{ opacity: 0.6, scale: 0 }}
                                    animate={{ opacity: 0, scale: 2.2 }}
                                    exit={{ opacity: 0 }}
                                    transition={{
                                      duration: 0.4,
                                      ease: "easeOut",
                                    }}
                                    className="absolute inset-0 bg-green-500 rounded-full pointer-events-none animate-none"
                                  />
                                )}
                              </AnimatePresence>
                            </motion.button>
                          </div>
                          <div className="space-y-8">
                            {(() => {
                              const { header, footer } = getHFSettings(
                                selectedReport.category_id,
                              );
                              return (
                                <>
                                  {header && (
                                    <div className="prose prose-sm max-w-none pb-4 border-b border-gray-50 italic text-gray-500 text-sm">
                                      <Markdown>
                                        {formatForMarkdownPreview(header)}
                                      </Markdown>
                                    </div>
                                  )}

                                  <div className="prose prose-sm max-w-none">
                                    <div className={`font-sans text-[15px] leading-relaxed ${
                                      theme === "dark" ? "text-gray-200" : "text-gray-900"
                                    }`}>
                                      <Markdown>
                                        {formatForMarkdownPreview(
                                          selectedReport.content_en,
                                        )}
                                      </Markdown>
                                    </div>
                                  </div>

                                  <div className="prose prose-sm max-w-none">
                                    <div className={`font-sans text-[15px] leading-relaxed ${
                                      theme === "dark" ? "text-gray-200" : "text-gray-900"
                                    }`}>
                                      <Markdown>
                                        {formatForMarkdownPreview(
                                          selectedReport.content_hi,
                                        )}
                                      </Markdown>
                                    </div>
                                  </div>

                                  {footer && (
                                    <div className="prose prose-sm max-w-none pt-4 border-t border-gray-50 italic text-gray-500 text-sm">
                                      <Markdown>
                                        {formatForMarkdownPreview(footer)}
                                      </Markdown>
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
                        <div className={`h-20 w-20 rounded-full flex items-center justify-center shadow-inner ${
                          theme === "dark" ? "bg-[#252729]" : "bg-gray-300"
                        }`}>
                          <FileText size={40} className={theme === "dark" ? "text-gray-400" : "text-gray-600"} />
                        </div>
                        <div>
                          <h3 className={`text-xl font-bold ${
                            theme === "dark" ? "text-white" : "text-gray-900"
                          }`}>
                            No News Selected
                          </h3>
                          <p className={`text-base font-medium max-w-xs mx-auto ${
                            theme === "dark" ? "text-gray-300" : "text-gray-700"
                          }`}>
                            Select an item from the history feed to view its
                            analysis.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </main>
            </>
          {false && (
            <>
              {/* Panel 1: Vertical Option Bar specifically for Commentary */}
              <div className="flex w-16 flex-col items-center justify-between bg-[#009f75] py-4 shadow-[4px_0_10px_rgba(0,0,0,0.1)] z-30 shrink-0 select-none">
                {/* Option Group 1: Navigation & Modes */}
                <div className="flex flex-col items-center space-y-4 w-full px-2">
                  {/* Explorer mode */}
                  <button
                    onClick={() => setCommentaryPanelTab("explorer")}
                    className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200 cursor-pointer ${
                      commentaryPanelTab === "explorer"
                        ? "bg-white text-[#009f75] shadow-lg scale-105"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`}
                    title="Spreadsheet explorer (Panel 2 & 3)"
                  >
                    <Database size={20} />
                    {commentaryPanelTab === "explorer" && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-l-md" />
                    )}
                  </button>

                  {/* AI Analytics mode */}
                  <button
                    onClick={() => setCommentaryPanelTab("analytics")}
                    className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200 cursor-pointer ${
                      commentaryPanelTab === "analytics"
                        ? "bg-white text-[#009f75] shadow-lg scale-105"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`}
                    title="AI commentary parameters & results (Panel 4)"
                  >
                    <Sparkles size={20} />
                    {commentaryPanelTab === "analytics" && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-l-md" />
                    )}
                  </button>

                  {/* Report History */}
                  <button
                    onClick={() => setCommentaryPanelTab("history")}
                    className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200 cursor-pointer ${
                      commentaryPanelTab === "history"
                        ? "bg-white text-[#009f75] shadow-lg scale-105"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`}
                    title="Saved commentaries & reports history"
                  >
                    <History size={20} />
                    {commentaryPanelTab === "history" && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-l-md" />
                    )}
                  </button>
                </div>

                {/* Settings / General Actions */}
                <div className="flex flex-col items-center space-y-3 w-full px-2">
                  {/* Toggle Theme */}
                  <button
                    onClick={() =>
                      setTheme((prev) => (prev === "light" ? "dark" : "light"))
                    }
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer"
                    title={
                      theme === "light"
                        ? "Switch to Dark Mode"
                        : "Switch to Light Mode"
                    }
                  >
                    {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                  </button>

                  {/* Quick Trigger Modal Settings */}
                  <button
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setActiveSettingsTab("api_keys");
                    }}
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer"
                    title="Manage Gemini/Image API Keys"
                  >
                    <Key size={18} />
                  </button>
                </div>
              </div>

              {/* Main Row layout wrapper for Commentary Tab containing Panel 2, Panel 3, and Panel 4 */}
              <div className="flex flex-1 flex-row overflow-hidden w-full h-full">
                {/* Panel 2: Spreadsheet Navigator (Left Panel, 320px width, clean background) */}
                <div
                  className={`w-[320px] shrink-0 border-r flex flex-col h-full transition-colors duration-300 ${
                    theme === "dark"
                      ? "bg-[#212325] border-[#2d2f31]"
                      : "bg-[#fafafa] border-gray-200"
                  }`}
                >
                  {/* Header */}
                  <div
                    className={`p-4 border-b shrink-0 flex items-center justify-between ${
                      theme === "dark" ? "border-[#2d2f31]" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <FileText size={18} className="text-[#009f75]" />
                      <h4
                        className={`text-xs font-black uppercase tracking-wider ${
                          theme === "dark" ? "text-white" : "text-[#394a5a]"
                        }`}
                      >
                        Excel Worksheet
                      </h4>
                    </div>
                  </div>

                  {/* Upload / Browse Zone */}
                  <div className="p-4 border-b shrink-0 flex flex-col space-y-3">
                    <div
                      className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all duration-200 ${
                        theme === "dark"
                          ? "border-[#2d2f31] bg-[#1e2022] hover:bg-[#25282a]"
                          : "border-gray-300 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleSpreadsheetUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      />
                      <div className="flex flex-col items-center space-y-1.5 pointer-events-none">
                        <FileUp
                          size={24}
                          className="text-[#009f75] mb-1 animate-bounce"
                        />
                        <span
                          className={`text-xs font-bold ${
                            theme === "dark" ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Browse Spreadsheet
                        </span>
                        <span className="text-[10px] text-gray-500">
                          Supports .xlsx, .xls, .csv
                        </span>
                      </div>
                    </div>

                    {/* Display current filename if any */}
                    {commentaryFileName && (
                      <div
                        className={`flex items-center space-x-2 p-2 rounded-lg border text-xs ${
                          theme === "dark"
                            ? "bg-[#1a1c1e] text-gray-300 border-[#2d2f31]"
                            : "bg-green-50 text-[#009f75] border-green-200"
                        }`}
                      >
                        <FileText size={14} className="shrink-0" />
                        <span
                          className="font-semibold truncate max-w-[220px]"
                          title={commentaryFileName}
                        >
                          {commentaryFileName}
                        </span>
                        <span className="ml-auto text-[9px] bg-green-200 text-[#009f75] px-1.5 py-0.5 rounded-full font-bold">
                          Active
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Sheets List Header */}
                  <div
                    className={`px-4 py-2.5 border-b shrink-0 flex items-center justify-between ${
                      theme === "dark"
                        ? "bg-[#292b2d] border-[#2d2f31]"
                        : "bg-gray-100 border-gray-200"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider ${
                        theme === "dark" ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      Sheet Selection / Context
                    </span>
                    <span className="text-[9px] text-[#009f75] font-black uppercase">
                      AI Context Toggle
                    </span>
                  </div>

                  {/* Sheets list container with checkboxes */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {commentarySheets.map((sheet) => {
                      const isCurrentActive =
                        activeCommentarySheet === sheet.sheetName;
                      return (
                        <div
                          key={sheet.sheetName}
                          onClick={() => {
                            setActiveCommentarySheet(sheet.sheetName);
                            setCommentaryPageNum(0);
                          }}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-150 cursor-pointer ${
                            isCurrentActive
                              ? theme === "dark"
                                ? "bg-[#1e2e28] border-[#009f75] shadow-sm"
                                : "bg-green-50 border-green-300 shadow-sm"
                              : theme === "dark"
                                ? "bg-[#1a1c1e] hover:bg-[#25282a] border-transparent"
                                : "bg-white hover:bg-gray-50 border-[#eaedf0]"
                          }`}
                        >
                          <div
                            className="flex items-center space-x-2.5 min-w-0"
                            style={{ pointerEvents: "none" }}
                          >
                            <div
                              className={`w-2 h-2 rounded-full ${
                                isCurrentActive ? "bg-[#009f75]" : "bg-gray-400"
                              }`}
                            />
                            <span
                              className={`text-xs font-bold truncate max-w-[150px] ${
                                isCurrentActive
                                  ? theme === "dark"
                                    ? "text-white"
                                    : "text-green-900"
                                  : theme === "dark"
                                    ? "text-gray-300"
                                    : "text-gray-700"
                              }`}
                            >
                              {sheet.sheetName}
                            </span>
                            <span className="text-[9px] text-gray-500 font-medium">
                              ({sheet.data.length - 1} rows)
                            </span>
                          </div>

                          {/* Checkbox context controller */}
                          <label
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="relative flex items-center justify-center p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                            title="Include in AI analysis context prompt"
                          >
                            <input
                              type="checkbox"
                              checked={sheet.selected}
                              onChange={() => {
                                setCommentarySheets((prev) =>
                                  prev.map((s) =>
                                    s.sheetName === sheet.sheetName
                                      ? { ...s, selected: !s.selected }
                                      : s,
                                  ),
                                );
                              }}
                              className="w-4 h-4 accent-[#009f75] cursor-pointer rounded-sm border-gray-300 focus:ring-0"
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Panel 3: Sheet Content Visualizer (Center, grows dynamically) */}
                <div
                  className={`flex-1 flex flex-col h-full border-r overflow-hidden transition-colors duration-300 ${
                    theme === "dark"
                      ? "bg-[#1e2022] border-[#2d2f31]"
                      : "bg-white border-gray-200"
                  }`}
                >
                  {/* Header */}
                  <div
                    className={`p-4 border-b shrink-0 flex items-center justify-between ${
                      theme === "dark" ? "border-[#2d2f31]" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Layout size={18} className="text-[#009f75]" />
                      <h4
                        className={`text-xs font-black uppercase tracking-wider ${
                          theme === "dark" ? "text-white" : "text-[#394a5a]"
                        }`}
                      >
                        Sheet Data Preview:{" "}
                        <span className="text-[#009f75] normal-case">
                          {activeCommentarySheet}
                        </span>
                      </h4>
                    </div>

                    <span className="text-[10px] bg-[#009f75]/10 text-[#009f75] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                      Client Interactive Preview
                    </span>
                  </div>

                  {/* Interactive Filter Controls Bar */}
                  <div
                    className={`p-4 border-b flex flex-wrap items-center gap-4 ${
                      theme === "dark"
                        ? "bg-[#25282a] border-[#2d2f31]"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    {/* Commodity Selector */}
                    <div className="flex flex-col space-y-1.5 min-w-xs">
                      <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                        Select Commodity filter:
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          "All",
                          "Copper",
                          "Aluminum",
                          "Nickel",
                          "Zinc",
                          "Lead",
                          "Tin",
                        ].map((commodity) => {
                          const isSelected =
                            selectedCommentaryCommodity === commodity;
                          return (
                            <button
                              key={commodity}
                              onClick={() => {
                                setSelectedCommentaryCommodity(commodity);
                                setCommentaryPageNum(0);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-[#009f75] text-white shadow-sm font-black"
                                  : theme === "dark"
                                    ? "bg-[#1e2022] text-gray-300 hover:bg-[#34373a] hover:text-white border border-[#2d2f31]"
                                    : "bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900 border border-gray-200"
                              }`}
                            >
                              {commodity}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Date Range Selection (Period) */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex flex-col space-y-1.5">
                        <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                          Start Date:
                        </span>
                        <input
                          type="date"
                          value={commentaryStartDate}
                          onChange={(e) => {
                            setCommentaryStartDate(e.target.value);
                            setCommentaryPageNum(0);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                            theme === "dark"
                              ? "bg-[#1e2022] text-white border-[#2d2f31] focus:border-[#009f75]"
                              : "bg-white text-gray-800 border-gray-300 focus:border-[#009f75]"
                          }`}
                        />
                      </div>
                      <div className="flex flex-col space-y-1.5">
                        <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                          End Date:
                        </span>
                        <input
                          type="date"
                          value={commentaryEndDate}
                          onChange={(e) => {
                            setCommentaryEndDate(e.target.value);
                            setCommentaryPageNum(0);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                            theme === "dark"
                              ? "bg-[#1e2022] text-white border-[#2d2f31] focus:border-[#009f75]"
                              : "bg-white text-gray-800 border-gray-300 focus:border-[#009f75]"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Reset Action */}
                    <div className="flex items-end self-stretch pb-1.5">
                      <button
                        onClick={() => {
                          setSelectedCommentaryCommodity("All");
                          setCommentaryStartDate("2025-02-25");
                          setCommentaryEndDate("2025-03-20");
                          setCommentaryPageNum(0);
                        }}
                        className="text-[10px] uppercase font-black tracking-wider text-[#009f75] hover:underline cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    </div>
                  </div>

                  {/* Table View */}
                  <div className="flex-1 overflow-auto p-4">
                    {(() => {
                      const activeSheetObj = commentarySheets.find(
                        (s) => s.sheetName === activeCommentarySheet,
                      );
                      if (!activeSheetObj || activeSheetObj.data.length === 0) {
                        return (
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-500">
                            <FileText
                              size={48}
                              className="text-gray-400 mb-2 animate-pulse"
                            />
                            <p className="text-xs font-semibold">
                              No spreadsheet grid data loaded in active layout.
                            </p>
                          </div>
                        );
                      }

                      const headers = activeSheetObj.data[0];
                      const rowData = activeSheetObj.data.slice(1);

                      // 1. Get visible column indices for headers based on selected commodity
                      const visibleColIndices = getVisibleColumnIndices(
                        headers,
                        selectedCommentaryCommodity,
                      );
                      const displayHeaders = visibleColIndices.map(
                        (idx) => headers[idx],
                      );

                      // 2. Filter original rowData row-by-row based on dates and/or commodity profile matching
                      const filteredRowData = getFilteredRowsForSheet(
                        activeCommentarySheet,
                        headers,
                        rowData,
                        selectedCommentaryCommodity,
                        commentaryStartDate,
                        commentaryEndDate,
                      );

                      // Apply pagination
                      const totalRows = filteredRowData.length;
                      const totalPages = Math.ceil(totalRows / rowsPerPage);
                      const displayRows = filteredRowData.slice(
                        commentaryPageNum * rowsPerPage,
                        (commentaryPageNum + 1) * rowsPerPage,
                      );

                      return (
                        <div className="flex flex-col h-full justify-between">
                          {/* Scrollable table boundary */}
                          <div className="overflow-x-auto border rounded-xl shadow-sm max-h-[60vh] dark:border-gray-800">
                            <table className="w-full text-left border-collapse select-text">
                              <thead>
                                <tr
                                  className={`${
                                    theme === "dark"
                                      ? "bg-[#292b2d]"
                                      : "bg-gray-50"
                                  }`}
                                >
                                  {displayHeaders.map((hdr, hIdx) => (
                                    <th
                                      key={hIdx}
                                      className={`px-4 py-3 text-[11px] font-black uppercase tracking-wider border-b ${
                                        theme === "dark"
                                          ? "text-gray-300 border-[#2d2f31]"
                                          : "text-[#394a5a] border-gray-200"
                                      }`}
                                    >
                                      {String(hdr)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {displayRows.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={`transition-colors duration-100 ${
                                      theme === "dark"
                                        ? "hover:bg-[#25282a]"
                                        : "hover:bg-slate-50/50"
                                    }`}
                                  >
                                    {visibleColIndices.map((origIdx) => {
                                      const cellVal =
                                        row[origIdx] !== undefined
                                          ? String(row[origIdx])
                                          : "";
                                      const isNegativeChange =
                                        !isNaN(Number(cellVal)) &&
                                        Number(cellVal) < 0 &&
                                        String(headers[origIdx])
                                          .toLowerCase()
                                          .includes("change");
                                      const isPositiveChange =
                                        !isNaN(Number(cellVal)) &&
                                        Number(cellVal) > 0 &&
                                        String(headers[origIdx])
                                          .toLowerCase()
                                          .includes("change");

                                      return (
                                        <td
                                          key={origIdx}
                                          className={`px-4 py-2.5 text-xs font-medium tracking-tight ${
                                            isNegativeChange
                                              ? "text-rose-500 font-bold bg-rose-500/5"
                                              : isPositiveChange
                                                ? "text-emerald-500 font-bold bg-emerald-500/5"
                                                : theme === "dark"
                                                  ? "text-gray-300"
                                                  : "text-gray-800"
                                          }`}
                                        >
                                          {cellVal}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Pagination Controls */}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between p-3 shrink-0 select-none mt-4 border-t dark:border-gray-800">
                              <span className="text-xs text-gray-500 font-medium">
                                Showing{" "}
                                <span className="font-bold text-[#009f75]">
                                  {commentaryPageNum * rowsPerPage + 1}
                                </span>{" "}
                                to{" "}
                                <span className="font-bold text-[#009f75]">
                                  {Math.min(
                                    (commentaryPageNum + 1) * rowsPerPage,
                                    totalRows,
                                  )}
                                </span>{" "}
                                of{" "}
                                <span className="font-bold text-gray-700 dark:text-gray-300">
                                  {totalRows}
                                </span>{" "}
                                entries
                              </span>

                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() =>
                                    setCommentaryPageNum((p) =>
                                      Math.max(0, p - 1),
                                    )
                                  }
                                  disabled={commentaryPageNum === 0}
                                  className={`p-1.5 rounded-lg border text-xs font-bold transition-all ${
                                    commentaryPageNum === 0
                                      ? "text-gray-400 border-gray-200 cursor-not-allowed dark:border-gray-800"
                                      : "text-[#009f75] border-green-200 hover:bg-green-50 dark:hover:bg-[#1e2e28] cursor-pointer"
                                  }`}
                                >
                                  <ChevronLeft size={16} />
                                </button>
                                <span className="text-xs font-bold px-2 dark:text-gray-300">
                                  Page {commentaryPageNum + 1} of {totalPages}
                                </span>
                                <button
                                  onClick={() =>
                                    setCommentaryPageNum((p) =>
                                      Math.min(totalPages - 1, p + 1),
                                    )
                                  }
                                  disabled={commentaryPageNum >= totalPages - 1}
                                  className={`p-1.5 rounded-lg border text-xs font-bold transition-all ${
                                    commentaryPageNum >= totalPages - 1
                                      ? "text-gray-400 border-gray-200 cursor-not-allowed dark:border-gray-800"
                                      : "text-[#009f75] border-green-200 hover:bg-green-50 dark:hover:bg-[#1e2e28] cursor-pointer"
                                  }`}
                                >
                                  <ChevronRight size={16} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Panel 4: AI Commentary Compiler (Right Panel, 450px width) */}
                <div
                  className={`w-[450px] shrink-0 flex flex-col h-full transition-colors duration-300 ${
                    theme === "dark"
                      ? "bg-[#1a1c1e] text-gray-200"
                      : "bg-[#f4f5f7] text-gray-800"
                  }`}
                >
                  {/* Header */}
                  <div
                    className={`p-4 border-b shrink-0 flex items-center justify-between ${
                      theme === "dark" ? "border-[#2d2f31]" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Sparkles
                        size={18}
                        className="text-amber-500 animate-pulse"
                      />
                      <h4
                        className={`text-xs font-black uppercase tracking-wider ${
                          theme === "dark" ? "text-white" : "text-[#394a5a]"
                        }`}
                      >
                        GenAI Analytics compiler
                      </h4>
                    </div>
                  </div>

                  {commentaryPanelTab === "history" ? (
                    /* --- History View in Panel 4 --- */
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black uppercase text-gray-500 tracking-wider">
                          Saved Commentary Reports
                        </h5>
                        {commentaryHistory.length > 0 && (
                          <button
                            onClick={() => {
                              if (confirm("Clear saved commentary history?")) {
                                setCommentaryHistory([]);
                                localStorage.removeItem("commentary_history");
                              }
                            }}
                            className="text-[10px] text-rose-500 hover:underline font-bold cursor-pointer"
                          >
                            Clear All
                          </button>
                        )}
                      </div>

                      {commentaryHistory.length === 0 ? (
                        <div className="p-8 text-center border-2 border-dashed dark:border-gray-800 rounded-2xl text-gray-500">
                          <Archive
                            size={32}
                            className="mx-auto mb-2 opacity-55"
                          />
                          <p className="text-xs font-semibold">
                            No saved commentaries found.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {commentaryHistory.map((item) => (
                            <div
                              key={item.id}
                              className={`p-4 rounded-2xl border transition-all hover:scale-[1.01] duration-150 cursor-pointer ${
                                theme === "dark"
                                  ? "bg-[#212325] border-[#2d2f31] hover:bg-[#25282a]"
                                  : "bg-white border-[#eaedf0] hover:bg-gray-50"
                              }`}
                            >
                              <div className="flex justify-between items-start mb-1.5">
                                <h6 className="text-xs font-extrabold text-[#009f75] truncate max-w-[280px]">
                                  {item.title}
                                </h6>
                                <span className="text-[9px] text-gray-500 font-mono">
                                  {item.date}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-500 line-clamp-3 mb-2.5">
                                {item.content
                                  .replace(/[#*`\-]/g, "")
                                  .slice(0, 150)}
                                ...
                              </p>
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => {
                                    setGeneratedCommentary(item.content);
                                    setCommentaryPanelTab("analytics");
                                  }}
                                  className="text-[10px] text-[#009f75] hover:underline font-bold mr-auto cursor-pointer"
                                >
                                  Load in Viewer
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(item.content);
                                    alert(
                                      "Commentary content copied to clipboard!",
                                    );
                                  }}
                                  className="text-[10px] text-gray-500 hover:text-gray-900 font-bold dark:hover:text-white cursor-pointer"
                                >
                                  Copy
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = commentaryHistory.filter(
                                      (h) => h.id !== item.id,
                                    );
                                    setCommentaryHistory(updated);
                                    localStorage.setItem(
                                      "commentary_history",
                                      JSON.stringify(updated),
                                    );
                                  }}
                                  className="text-[10px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* --- Controls and Live Generative Results in Panel 4 --- */
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Upper: Scrollable configuration area */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Duration Selector */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                            Report Timeline
                          </label>
                          <div className="grid grid-cols-4 gap-1 bg-gray-150 dark:bg-gray-800 p-1 rounded-xl">
                            {(
                              ["daily", "weekly", "monthly", "yearly"] as const
                            ).map((dur) => (
                              <button
                                key={dur}
                                onClick={() => setCommentaryDuration(dur)}
                                className={`py-1.5 rounded-lg text-[10px] font-black uppercase select-none transition-all duration-150 cursor-pointer ${
                                  commentaryDuration === dur
                                    ? "bg-[#009f75] text-white shadow-sm font-black"
                                    : "text-gray-500 hover:text-gray-900 font-bold dark:hover:text-white"
                                }`}
                              >
                                {dur}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Length Controller */}
                        <div className="space-y-1.5 text-left">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-500 tracking-wider">
                            <span>Target Length</span>
                            <span className="text-[#009f75] font-mono font-bold">
                              {commentaryLengthLines} Lines
                            </span>
                          </div>
                          <div className="flex items-center space-x-3 bg-white dark:bg-[#212325] p-3 rounded-2xl border dark:border-gray-800">
                            <span className="text-xs text-gray-400 font-semibold select-none">
                              Short
                            </span>
                            <input
                              type="range"
                              min={5}
                              max={35}
                              step={1}
                              value={commentaryLengthLines}
                              onChange={(e) =>
                                setCommentaryLengthLines(Number(e.target.value))
                              }
                              className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#009f75] focus:outline-none focus:ring-0"
                            />
                            <span className="text-xs text-gray-400 font-semibold select-none">
                              Detailed
                            </span>
                          </div>
                        </div>

                        {/* Active Context Helper */}
                        <div
                          className={`p-3.5 rounded-2xl border text-xs space-y-2.5 transition-colors duration-300 ${
                            theme === "dark"
                              ? "bg-[#212325] border-gray-800 text-gray-300"
                              : "bg-green-50/30 border-green-200 text-green-950"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Database
                                size={14}
                                className="text-[#009f75] shrink-0"
                              />
                              <span className="font-bold">Context Target:</span>
                            </div>
                            <span className="bg-[#009f75] text-white px-2.5 py-0.5 rounded-full text-[10px] font-black">
                              {
                                commentarySheets.filter((s) => s.selected)
                                  .length
                              }{" "}
                              sheets selected
                            </span>
                          </div>

                          <div className="border-t border-dashed border-gray-300/40 dark:border-gray-700/60 pt-2 space-y-1.5 text-[11px]">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-gray-500 dark:text-gray-400">
                                Target Commodity:
                              </span>
                              <span className="font-black text-[#009f75] uppercase">
                                {selectedCommentaryCommodity}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-gray-500 dark:text-gray-400">
                                Target Period:
                              </span>
                              <span className="font-bold text-gray-800 dark:text-gray-200">
                                {commentaryStartDate} to {commentaryEndDate}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Custom Instructions */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                            Specific Report Guidelines
                          </label>
                          <textarea
                            rows={3}
                            value={commentaryPromptText}
                            onChange={(e) =>
                              setCommentaryInstruction(e.target.value)
                            }
                            placeholder="e.g. Highlight the high volatility rating of Tin or focus Copper boundaries near 235,000..."
                            className={`w-full p-3 rounded-2xl text-xs font-semibold border placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#009f75] ${
                              theme === "dark"
                                ? "bg-[#212325] border-gray-800 text-white placeholder-gray-600"
                                : "bg-white border-gray-300 text-gray-800"
                            }`}
                          />
                        </div>

                        {/* Trigger Button */}
                        <button
                          onClick={handleGenerateCommentary}
                          disabled={isAnalyzingCommentary}
                          className={`w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider text-white shadow-md cursor-pointer transition-all hover:brightness-105 active:scale-95 ${
                            isAnalyzingCommentary
                              ? "bg-gray-400 cursor-not-allowed"
                              : "bg-[#009f75]"
                          }`}
                        >
                          {isAnalyzingCommentary ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Generating Report Summary...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={16} />
                              <span>Build Market Commentary</span>
                            </>
                          )}
                        </button>

                        {/* Output Preview */}
                        {generatedCommentary && (
                          <div className="mt-4 space-y-4 animate-fade-in text-left">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase text-[#009f75] tracking-wider select-none">
                              <span>Analytical Intelligence Document</span>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(
                                      generatedCommentary,
                                    );
                                    alert("Report copied successfully!");
                                  }}
                                  className="hover:underline font-bold cursor-pointer"
                                >
                                  Copy Raw
                                </button>
                                <span>|</span>
                                <button
                                  onClick={handleSaveCommentaryToHistory}
                                  className="hover:underline font-bold cursor-pointer"
                                >
                                  Save Report
                                </button>
                              </div>
                            </div>

                            {/* WhatsApp style preview card */}
                            <div className="space-y-1.5 selection:bg-green-100">
                              <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide block select-none">
                                WhatsApp Client Outreach Copyable Preview
                              </span>

                              <div className="whatsapp-bubble rounded-2xl p-4 bg-[#e8f5e9] text-[#1b5e20] border-l-4 border-[#25d366] max-w-sm ml-0 shadow-sm relative text-xs font-semibold leading-relaxed font-sans select-text">
                                <div className="text-[10px] font-black text-[#0f5132] uppercase mb-1.5 tracking-wider flex items-center justify-between select-none">
                                  <span>🔔 LME MARKET BRIEFING</span>
                                  <span>LIVE</span>
                                </div>

                                <div className="whitespace-pre-wrap select-text text-[11px] font-medium leading-relaxed font-mono">
                                  {generatedCommentary
                                    .replace(/[#]/g, "")
                                    .replace(/\*\*/g, "*")
                                    .slice(0, 380)}
                                  ...
                                </div>

                                <div className="text-[9px] text-[#0f5132] font-black text-right select-none mt-2">
                                  ✓✓ Delivered via Broadcast
                                </div>
                              </div>
                            </div>

                            {/* Full markdown detail render */}
                            <div
                              className={`p-4 rounded-3xl border select-text ${
                                theme === "dark"
                                  ? "bg-[#212325] border-gray-800"
                                  : "bg-white border-gray-200"
                              }`}
                            >
                              <div className="prose prose-sm max-w-none dark:prose-invert text-xs leading-relaxed select-text font-medium">
                                <Markdown>{generatedCommentary}</Markdown>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* If right panel is maximized, show slideback chevron to restore left panel */}
          {maximizedPanel === "right" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMaximize("right");
              }}
              className={`absolute left-0 top-1/2 -translate-y-1/2 w-5 h-16 border rounded-r-xl shadow-md flex items-center justify-center transition-all cursor-pointer z-50 ${
                theme === "dark"
                  ? "bg-[#1e2022] border-[#2d2f31] text-gray-400 hover:text-white hover:bg-gray-800"
                  : "bg-white border-gray-200 border-l-0 text-gray-400 hover:text-[#009f75] hover:bg-gray-50"
              }`}
              title="Restore left panel"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Pre-generation Criteria Selection Modal */}
        {isGenerateCriteriaModalOpen && generationRefineTarget && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border p-6 ${
                theme === "dark"
                  ? "bg-[#1e2022] border-[#2d2f31] text-gray-200"
                  : "bg-white border-gray-150 text-gray-800"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center">
                    <Sparkles className="text-[#009f75] mr-2" size={20} />
                    Define Criteria for AI Generation
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Select the target criteria context for this news generation.
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 my-4 custom-scrollbar">
                {criteriaList.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500 italic font-bold">
                    No criteria configured yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 animate-in fade-in duration-200">
                    {criteriaList.map((crit) => (
                      <button
                        key={crit.id}
                        onClick={() => setGenerationSelectedCriteriaId(crit.id)}
                        className={`w-full text-left px-4 py-2.5 rounded-xl text-xs uppercase font-black tracking-wider transition-all border flex items-center justify-between cursor-pointer ${
                          generationSelectedCriteriaId === crit.id
                            ? "bg-[#009f75]/10 border-[#009f75] text-[#009f75]"
                            : theme === "dark"
                              ? "bg-[#2a2c2e] border-transparent text-gray-250 hover:bg-[#2d2f31]/60"
                              : "bg-gray-55 border-gray-150 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span>{crit.name}</span>
                        {generationSelectedCriteriaId === crit.id ? (
                          <Check size={14} className="text-[#009f75]" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => setGenerationSelectedCriteriaId(null)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-xs uppercase font-black tracking-wider transition-all border flex items-center justify-between cursor-pointer ${
                        generationSelectedCriteriaId === null
                          ? "bg-amber-100/15 border-amber-300 text-amber-600"
                          : theme === "dark"
                            ? "bg-[#2a2c2e] border-transparent text-gray-250 hover:bg-[#2d2f31]/60"
                            : "bg-gray-55 border-gray-150 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span>No Criteria</span>
                      {generationSelectedCriteriaId === null ? (
                        <Check size={14} className="text-amber-600" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex flex-col space-y-2">
                <button
                  onClick={async () => {
                    setIsGenerateCriteriaModalOpen(false);
                    if (generationRefineTarget) {
                      await handleRefine(generationRefineTarget, generationSelectedCriteriaId);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl font-black uppercase tracking-wider text-xs transition-all text-center bg-[#009f75] text-white hover:bg-[#008f65] cursor-pointer shadow-sm flex items-center justify-center space-x-2 animate-pulse hover:animate-none"
                >
                  <Sparkles size={14} />
                  <span>Generate News</span>
                </button>

                <div className="flex justify-between items-center text-[11px] pt-1.5 font-bold">
                  <button
                    onClick={() => {
                      setIsGenerateCriteriaModalOpen(false);
                      setActiveSettingsTab("criteria");
                      setIsSettingsOpen(true);
                    }}
                    className="text-[#009f75] hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Settings2 size={12} />
                    <span>Configure Master Criteria list</span>
                  </button>
                  <button
                    onClick={() => setIsGenerateCriteriaModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Criteria Assignment Modal upon copying */}
        {copyPendingItem && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border p-6 ${
                theme === "dark"
                  ? "bg-[#1e2022] border-[#2d2f31] text-gray-200"
                  : "bg-white border-gray-150 text-gray-800"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center">
                    <Tags className="text-[#009f75] mr-2" size={20} />
                    Assign Criteria First
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Tagging refined news with pre-defined criteria helps
                    organize and filter templates correctly.
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 my-4 custom-scrollbar">
                {criteriaList.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500 italic font-bold">
                    No criteria configured yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5">
                    {criteriaList.map((crit) => (
                      <button
                        key={crit.id}
                        onClick={async () => {
                          await handleUpdateNewsCriteria(
                            copyPendingItem.id,
                            crit.id,
                          );
                          await handleCopy(
                            "news",
                            copyPendingItem.id,
                            copyPendingItem.content,
                            true,
                          );
                          setCopyPendingItem(null);
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-xl text-xs uppercase font-black tracking-wider transition-all border flex items-center justify-between cursor-pointer ${
                          theme === "dark"
                            ? "bg-[#2a2c2e] border-transparent text-gray-200 hover:bg-[#009f75]/10 hover:text-[#009f75] hover:border-[#009f75]/20"
                            : "bg-gray-55 border-gray-150 text-gray-700 hover:bg-[#009f75]/10 hover:text-[#009f75] hover:border-[#009f75]/20"
                        }`}
                      >
                        <span>{crit.name}</span>
                        <PlusCircle size={14} className="opacity-60" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex flex-col space-y-2">
                <button
                  onClick={async () => {
                    await handleCopy(
                      "news",
                      copyPendingItem.id,
                      copyPendingItem.content,
                      true,
                    );
                    setCopyPendingItem(null);
                  }}
                  className={`w-full py-2.5 rounded-xl font-black uppercase tracking-wider text-[11px] transition-all text-center cursor-pointer ${
                    theme === "dark"
                      ? "bg-gray-800 text-gray-300 hover:bg-gray-700/80"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Copy Without Any Criteria
                </button>

                <div className="flex justify-between items-center text-[11px] pt-1.5">
                  <button
                    onClick={() => {
                      setCopyPendingItem(null);
                      setActiveSettingsTab("criteria");
                      setIsSettingsOpen(true);
                    }}
                    className="text-[#009f75] hover:underline font-bold flex items-center space-x-1 cursor-pointer"
                  >
                    <Settings2 size={12} />
                    <span>Configure Master Criteria list</span>
                  </button>
                  <button
                    onClick={() => setCopyPendingItem(null)}
                    className="text-gray-400 hover:text-gray-600 font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Settings Modal */}
        {isSettingsOpen && (
          <>
            {/* Backdrop spacer masks the background faintly but lets mouse pointer move freely */}
            <div className="fixed inset-0 bg-black/35 backdrop-blur-[2px] z-55 pointer-events-none" />
            
            <div
              style={{
                position: "fixed",
                left: `${settingsPos.x}px`,
                top: `${settingsPos.y}px`,
                width: `${settingsSize.width}px`,
                height: `${settingsSize.height}px`,
              }}
              className="bg-white rounded-3xl shadow-[0_32px_100px_rgba(0,0,0,0.32)] border border-gray-150 overflow-hidden flex flex-col z-55 relative pointer-events-auto"
            >
              {/* Draggable transparent top/bottom/left/right border handles and corner grabbers */}
              {/* Top border */}
              <div
                onMouseDown={(e) => handleSettingsResizeStart(e, "n")}
                className="absolute top-0 left-2 right-2 h-2 cursor-n-resize z-[60] hover:bg-[#009f75]/10 transition-all"
                title="Drag to resize Height"
              />
              {/* Bottom border */}
              <div
                onMouseDown={(e) => handleSettingsResizeStart(e, "s")}
                className="absolute bottom-0 left-2 right-2 h-2 cursor-s-resize z-[60] hover:bg-[#009f75]/10 transition-all"
                title="Drag to resize Height"
              />
              {/* Left border */}
              <div
                onMouseDown={(e) => handleSettingsResizeStart(e, "w")}
                className="absolute left-0 top-2 bottom-2 w-2 cursor-w-resize z-[60] hover:bg-[#009f75]/10 transition-all"
                title="Drag to resize Width"
              />
              {/* Right border */}
              <div
                onMouseDown={(e) => handleSettingsResizeStart(e, "e")}
                className="absolute right-0 top-2 bottom-2 w-2 cursor-e-resize z-[60] hover:bg-[#009f75]/10 transition-all"
                title="Drag to resize Width"
              />
              {/* Corners */}
              <div
                onMouseDown={(e) => handleSettingsResizeStart(e, "nw")}
                className="absolute top-0 left-0 w-3.5 h-3.5 cursor-nw-resize z-[60] hover:bg-[#009f75]/30 transition-all rounded-tl-3xl"
              />
              <div
                onMouseDown={(e) => handleSettingsResizeStart(e, "ne")}
                className="absolute top-0 right-0 w-3.5 h-3.5 cursor-ne-resize z-[60] hover:bg-[#009f75]/30 transition-all rounded-tr-3xl"
              />
              <div
                onMouseDown={(e) => handleSettingsResizeStart(e, "sw")}
                className="absolute bottom-0 left-0 w-3.5 h-3.5 cursor-sw-resize z-[60] hover:bg-[#009f75]/30 transition-all rounded-bl-3xl"
              />
              <div
                onMouseDown={(e) => handleSettingsResizeStart(e, "se")}
                className="absolute bottom-0 right-0 w-4.5 h-4.5 cursor-se-resize z-[60] flex items-end justify-end p-0.5 select-none rounded-br-3xl hover:bg-[#009f75]/30 transition-all"
                title="Drag to custom scale"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" className="text-gray-400 select-none pointer-events-none mb-1 mr-1">
                  <path d="M6 0 L8 0 L8 8 L0 8 L0 6 L4 6 L4 4 L6 4 Z" fill="currentColor" opacity="0.5" />
                </svg>
              </div>

              {/* Modern Header Bar window controller */}
              <div
                onMouseDown={handleSettingsDragStart}
                className={`h-14 border-b border-gray-200/50 bg-gray-50/50 flex items-center justify-between px-6 select-none shrink-0 relative ${isDraggingSettings ? "cursor-grabbing" : "cursor-grab"}`}
                title="Drag window header to float or move settings box"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-200/30 rounded px-1.5 py-0.5 border border-gray-300/20 font-mono">
                    CONSOLE
                  </span>
                </div>

                {/* Elegant Centered Header Title */}
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
                  <span className="text-sm font-black text-gray-950 tracking-tight">
                    {activeSettingsTab === "general" && "General Settings"}
                    {activeSettingsTab === "api_keys" && "API Key Management"}
                    {activeSettingsTab === "data" && "Data & Backups"}
                    {activeSettingsTab === "criteria" && "Criteria Master"}
                    {activeSettingsTab === "reporting" && "Database Counter Reports"}
                  </span>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="hidden sm:flex items-center space-x-1 px-2 py-0.5 rounded bg-green-50/60 text-[#009f75] border border-green-200/20 text-[9px] font-bold uppercase tracking-wider font-mono font-mono">
                    FLOATABLE WINDOW
                  </div>

                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-1.5 text-gray-400 hover:text-gray-950 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                    title="Close (Esc)"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Main settings split layout */}
              <div className="flex-1 flex overflow-hidden w-full relative">
                {/* Settings Sidebar */}
                <div
                  className="w-56 bg-gray-50/40 border-r border-gray-200/50 flex flex-col shrink-0 select-none"
                >
                  <div className="p-3.5 space-y-1 flex-1 overflow-y-auto">
                    <button
                      onClick={() => setActiveSettingsTab("general")}
                      className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-colors ${activeSettingsTab === "general" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200/70 hover:text-gray-900"}`}
                    >
                      <Settings size={16} />
                      <span>General</span>
                    </button>
                    <button
                      onClick={() => setActiveSettingsTab("api_keys")}
                      className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-colors ${activeSettingsTab === "api_keys" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200/70 hover:text-gray-900"}`}
                    >
                      <Key size={16} />
                      <span>API Keys</span>
                    </button>
                    <button
                      onClick={() => setActiveSettingsTab("data")}
                      className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-colors ${activeSettingsTab === "data" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200/70 hover:text-gray-900"}`}
                    >
                      <Database size={16} />
                      <span>Data & Backups</span>
                    </button>
                    <button
                      onClick={() => setActiveSettingsTab("criteria")}
                      className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-colors ${activeSettingsTab === "criteria" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200/70 hover:text-gray-900"}`}
                    >
                      <Tags size={16} />
                      <span>Criteria Master</span>
                    </button>
                    <button
                      onClick={() => setActiveSettingsTab("reporting")}
                      className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-colors ${activeSettingsTab === "reporting" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200/70 hover:text-gray-900"}`}
                    >
                      <BarChart2 size={16} />
                      <span>Reporting</span>
                    </button>
                  </div>
                </div>

                {/* Settings Content */}
                <div className="flex-1 flex flex-col bg-white relative overflow-hidden">
                  {activeSettingsTab === "general" && (
                    <div className="p-6 overflow-y-auto flex-1">
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500">
                          Manage your application preferences and visual controls.
                        </p>
                      </div>
                      <div className="bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500 font-medium text-xs">
                        General settings (like default language or theme) will go
                        here in the future.
                      </div>
                    </div>
                  )}

                {activeSettingsTab === "api_keys" && (
                  <div className="flex flex-col h-full bg-gray-50/50">
                    <div className="p-6 overflow-y-auto flex-1">
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500">
                          Configure multiple Gemini AI keys for rotation and extended free tier usage.
                        </p>
                      </div>
                      {/* Add New Key Section */}
                      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center">
                          <PlusCircle
                            size={16}
                            className="mr-2 text-green-600"
                          />
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
                                const testRes = await fetch("/api/test-key", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    api_key: newKeyValue,
                                  }),
                                });

                                if (!testRes.ok) {
                                  const err = await testRes.json();
                                  throw new Error(
                                    err.error || "Key validation failed",
                                  );
                                }

                                const res = await fetch("/api/keys", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    name: newKeyName,
                                    api_key: newKeyValue,
                                  }),
                                });
                                if (!res.ok) {
                                  const err = await res.json();
                                  alert(err.error || "Failed to add key");
                                } else {
                                  setNewKeyName("");
                                  setNewKeyValue("");
                                  fetchApiKeys();
                                }
                              } catch (e: any) {
                                alert(
                                  "Invalid API Key. Google rejected it: " +
                                    e.message,
                                );
                              } finally {
                                setIsAddingKey(false);
                              }
                            }}
                            disabled={
                              isAddingKey || !newKeyName || !newKeyValue
                            }
                            className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center"
                          >
                            {isAddingKey ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              "Save Key"
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Keys List */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4">
                          Active Keys Rotation
                        </h3>
                        {apiKeys.length === 0 ? (
                          <div className="text-center py-8 text-gray-500 font-medium bg-white rounded-2xl border border-dashed border-gray-300">
                            No API keys added yet. The system is using the
                            default environment key.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {apiKeys
                              .sort((a, b) => a.sort_order - b.sort_order)
                              .map((key, index) => (
                                <div
                                  key={key.id}
                                  className={`flex items-center p-4 rounded-2xl border ${key.is_active ? "bg-white border-gray-200 shadow-sm" : "bg-gray-50 border-gray-200 opacity-60"}`}
                                >
                                  <div className="flex flex-col space-y-1 mr-4 text-gray-400">
                                    <button
                                      onClick={async () => {
                                        if (index === 0) return;
                                        const newKeys = [...apiKeys];
                                        const temp = newKeys[index - 1];
                                        newKeys[index - 1] = newKeys[index];
                                        newKeys[index] = temp;
                                        await fetch("/api/keys/reorder", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            orderedIds: newKeys.map(
                                              (k) => k.id,
                                            ),
                                          }),
                                        });
                                        fetchApiKeys();
                                      }}
                                      className="hover:text-gray-900 disabled:opacity-30"
                                      disabled={index === 0}
                                    >
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <polyline points="18 15 12 9 6 15"></polyline>
                                      </svg>
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (index === apiKeys.length - 1)
                                          return;
                                        const newKeys = [...apiKeys];
                                        const temp = newKeys[index + 1];
                                        newKeys[index + 1] = newKeys[index];
                                        newKeys[index] = temp;
                                        await fetch("/api/keys/reorder", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            orderedIds: newKeys.map(
                                              (k) => k.id,
                                            ),
                                          }),
                                        });
                                        fetchApiKeys();
                                      }}
                                      className="hover:text-gray-900 disabled:opacity-30"
                                      disabled={index === apiKeys.length - 1}
                                    >
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                      </svg>
                                    </button>
                                  </div>

                                  <div className="flex-1 flex items-center space-x-4">
                                    <div className="relative flex items-center justify-center">
                                      {key.status === "available" && (
                                        <div
                                          className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                                          title="Available"
                                        ></div>
                                      )}
                                      {key.status === "exhausted" && (
                                        <div
                                          className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                                          title="Exhausted (Resets at midnight)"
                                        ></div>
                                      )}
                                      {key.status === "invalid" && (
                                        <div
                                          className="w-3 h-3 rounded-full bg-gray-400"
                                          title="Invalid Key"
                                        ></div>
                                      )}
                                    </div>

                                    <div className="flex-1">
                                      <div className="flex items-center space-x-2">
                                        <span className="font-bold text-gray-900">
                                          {key.name}
                                        </span>
                                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                          {key.api_key.substring(0, 8)}••••••••
                                          {key.api_key.substring(
                                            key.api_key.length - 4,
                                          )}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-4 mt-1">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                          {key.usage_count} Requests Today
                                        </span>
                                        {key.last_used_at && (
                                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                            Last used:{" "}
                                            {new Date(
                                              key.last_used_at,
                                            ).toLocaleTimeString()}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-4 ml-4">
                                    <button
                                      onClick={async () => {
                                        await fetch(`/api/keys/${key.id}`, {
                                          method: "PATCH",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            is_active: key.is_active ? 0 : 1,
                                          }),
                                        });
                                        fetchApiKeys();
                                      }}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${key.is_active ? "bg-green-500" : "bg-gray-300"}`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${key.is_active ? "translate-x-6" : "translate-x-1"}`}
                                      />
                                    </button>

                                    <button
                                      onClick={async () => {
                                        if (
                                          confirm(
                                            "Are you sure you want to delete this key?",
                                          )
                                        ) {
                                          await fetch(`/api/keys/${key.id}`, {
                                            method: "DELETE",
                                          });
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

                {activeSettingsTab === "data" && (
                  <div className="p-6 overflow-y-auto flex-1">
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500">
                        Manage local database backups, exports, and schema configurations.
                      </p>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500 font-medium text-xs">
                      Database export and backup options will go here in the
                      future.
                    </div>
                  </div>
                )}

                {activeSettingsTab === "criteria" && (
                  <div className="p-6 overflow-y-auto flex-1 flex flex-col h-full">
                    <div className="mb-4 shrink-0">
                      <p className="text-xs font-semibold text-gray-500">
                        Manage predefined criteria descriptors used to tag and segment incoming news feeds.
                      </p>
                    </div>

                    {/* Add New Criteria Form */}
                    <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 mb-6 shrink-0">
                      <h3 className="text-sm font-black uppercase text-gray-750 tracking-wider mb-3">
                        Add Custom Criteria
                      </h3>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const val = e.currentTarget.criteriaName.value.trim();
                          if (!val) return;
                          try {
                            const res = await fetch("/api/criteria", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ name: val }),
                            });
                            if (!res.ok) {
                              const err = await res.json();
                              alert(err.error || "Failed to add criteria");
                              return;
                            }
                            e.currentTarget.reset();
                            fetchCriteria();
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="flex space-x-3"
                      >
                        <input
                          type="text"
                          name="criteriaName"
                          required
                          placeholder="e.g. Daily Closing, Special Report, Weekly Closing"
                          className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#009f75] text-gray-800 font-bold"
                        />
                        <button
                          type="submit"
                          className="px-5 py-2 bg-[#009f75] hover:bg-[#008f65] text-white font-black uppercase tracking-wider text-xs rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          Add Criteria
                        </button>
                      </form>
                    </div>

                    {/* Existing Criteria List */}
                    <div className="flex-1 overflow-y-auto border border-gray-150 rounded-2xl bg-white mb-4">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-[10px] text-gray-500 font-black uppercase tracking-wider border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-4">Criteria Name</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {criteriaList.length === 0 ? (
                            <tr>
                              <td
                                colSpan={2}
                                className="px-6 py-8 text-center text-gray-400 italic font-bold"
                              >
                                No criteria configured. Create some above.
                              </td>
                            </tr>
                          ) : (
                            criteriaList.map((crit) => (
                              <tr key={crit.id} className="hover:bg-gray-55/50">
                                <td className="px-6 py-4 font-bold text-gray-850">
                                  {editingCriteriaId === crit.id ? (
                                    <input
                                      type="text"
                                      defaultValue={crit.name}
                                      onBlur={async (e) => {
                                        const val = e.target.value.trim();
                                        if (!val) {
                                          setEditingCriteriaId(null);
                                          return;
                                        }
                                        try {
                                          await fetch(
                                            `/api/criteria/${crit.id}`,
                                            {
                                              method: "PUT",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                              },
                                              body: JSON.stringify({
                                                name: val,
                                              }),
                                            },
                                          );
                                          fetchCriteria();
                                        } catch (err) {
                                          console.error(err);
                                        }
                                        setEditingCriteriaId(null);
                                      }}
                                      onKeyDown={async (e) => {
                                        if (e.key === "Enter") {
                                          e.currentTarget.blur();
                                        }
                                      }}
                                      autoFocus
                                      className="px-2 py-1 border border-gray-300 rounded font-bold text-gray-800 focus:outline-none focus:border-[#009f75] text-sm"
                                    />
                                  ) : (
                                    <span>{crit.name}</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right space-x-4">
                                  <button
                                    onClick={() =>
                                      setEditingCriteriaId(crit.id)
                                    }
                                    className="text-[#009f75] hover:text-[#008f65] text-xs font-black uppercase tracking-wider"
                                  >
                                    Edit Name
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (
                                        confirm(
                                          `Are you sure you want to delete "${crit.name}"? Real-time news tagged with this criteria will have their tags reset to None.`,
                                        )
                                      ) {
                                        try {
                                          await fetch(
                                            `/api/criteria/${crit.id}`,
                                            { method: "DELETE" },
                                          );
                                          fetchCriteria();
                                          if (criteriaFilter === crit.id) {
                                            setCriteriaFilter("all");
                                          }
                                        } catch (err) {
                                          console.error(err);
                                        }
                                      }
                                    }}
                                    className="text-red-500 hover:text-red-700 text-xs font-black uppercase tracking-wider"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeSettingsTab === "reporting" && (
                  <div className="p-6 overflow-y-auto flex-1 flex flex-col h-full animate-fade-in text-gray-900">
                    {/* Header with Inline Checkbox */}
                    <div className="mb-3 shrink-0 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 select-none">
                        <input
                          id="sync-sidebar-counts-checkbox"
                          type="checkbox"
                          checked={showCountsInSidebar}
                          onChange={(e) => setShowCountsInSidebar(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-[#009f75] focus:ring-[#009f75] cursor-pointer accent-[#009f75]"
                        />
                        <label
                          htmlFor="sync-sidebar-counts-checkbox"
                          className="text-[10px] font-black uppercase tracking-wider text-gray-500 cursor-pointer hover:text-[#009f75] transition-colors"
                        >
                          Frontend display
                        </label>
                      </div>
                    </div>

                    {/* Highly Compact & Beautiful Filters Toolbar */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4 shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                      {/* 1. Timeframe selector */}
                      <div className="relative">
                        <label className="block text-[10px] font-black uppercase text-gray-450 tracking-wider mb-1">
                          Timeframe
                        </label>
                        <select
                          value={reportingPeriod}
                          onChange={(e) => setReportingPeriod(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:border-[#009f75] hover:border-gray-400 transition-colors shadow-xs cursor-pointer"
                        >
                          <option value="1day">1 Day</option>
                          <option value="1week">1 Week</option>
                          <option value="2weeks">2 Weeks</option>
                          <option value="3weeks">3 Weeks</option>
                          <option value="1month">1 Month</option>
                          <option value="2months">2 Months</option>
                          <option value="3months">3 Months</option>
                          <option value="1year">1 Year</option>
                          <option value="2years">2 Years</option>
                          <option value="3years">3 Years</option>
                          <option value="custom">Custom Range</option>
                        </select>
                      </div>

                      {/* 2. News Type */}
                      <div className="relative">
                        <label className="block text-[10px] font-black uppercase text-gray-450 tracking-wider mb-1">
                          News Type
                        </label>
                        <select
                          value={reportingNewsType}
                          onChange={(e) => setReportingNewsType(e.target.value as any)}
                          className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:border-[#009f75] hover:border-gray-400 transition-colors shadow-xs cursor-pointer"
                        >
                          <option value="all">All News (Raw & Refined)</option>
                          <option value="raw">Raw News Only</option>
                          <option value="refined">Refined News Only</option>
                        </select>
                      </div>

                      {/* 3. Criteria Tag */}
                      <div className="relative">
                        <label className="block text-[10px] font-black uppercase text-gray-450 tracking-wider mb-1">
                          Criteria Segment
                        </label>
                        <select
                          value={reportingCriteriaFilter}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "all" || val === "none") {
                              setReportingCriteriaFilter(val);
                            } else {
                              setReportingCriteriaFilter(Number(val));
                            }
                          }}
                          className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:border-[#009f75] hover:border-gray-400 transition-colors shadow-xs cursor-pointer"
                        >
                          <option value="all">All Criteria</option>
                          <option value="none">No Criteria (None)</option>
                          {criteriaList.map((crit) => (
                            <option key={crit.id} value={crit.id}>
                              {crit.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 4. Starred Select */}
                      <div className="relative">
                        <label className="block text-[10px] font-black uppercase text-gray-450 tracking-wider mb-1">
                          Starred Filter
                        </label>
                        <select
                          value={reportingStarredOnly ? "only" : "all"}
                          onChange={(e) => setReportingStarredOnly(e.target.value === "only")}
                          className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:border-[#009f75] hover:border-gray-400 transition-colors shadow-xs cursor-pointer"
                        >
                          <option value="all">All Items</option>
                          <option value="only">Starred Only</option>
                        </select>
                      </div>
                    </div>



                    {/* Custom Calendar date options */}
                    {reportingPeriod === "custom" && (
                      <div className="bg-[#f0f9f6] border border-[#d1ebd9]/60 rounded-xl p-3.5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 shrink-0 animate-fade-in">
                        <div>
                          <label className="block text-[10px] font-black uppercase text-[#009f75] tracking-wider mb-1">
                            From Date
                          </label>
                          <input
                            type="date"
                            value={reportingCustomFrom}
                            onChange={(e) => setReportingCustomFrom(e.target.value)}
                            className="w-full px-3 py-1 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:border-[#009f75] hover:border-gray-400 transition-colors shadow-xs cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-[#009f75] tracking-wider mb-1">
                            To Date
                          </label>
                          <input
                            type="date"
                            value={reportingCustomTo}
                            onChange={(e) => setReportingCustomTo(e.target.value)}
                            className="w-full px-3 py-1 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:border-[#009f75] hover:border-gray-400 transition-colors shadow-xs cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {/* Visual Warning Tip for Raw News + Criteria selection */}
                    {reportingNewsType === "raw" && reportingCriteriaFilter !== "all" && (
                      <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-1.5 mb-3 font-semibold flex items-center gap-1.5 animate-fade-in shrink-0">
                        <span>⚠️ Note: Criteria segments apply only to Refined News. Raw News does not contain criteria tagging.</span>
                      </div>
                    )}

                    {/* Dense & Full-Width Grid Container for Database Counters */}
                    <div className="flex-1 overflow-y-auto border border-gray-150 rounded-2xl bg-[#f8f9fa] p-4">
                      {categories.filter((c) => !c.parent_id).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                          <span className="text-sm font-bold">No sections configured in the database</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 w-full">
                          {categories
                            .filter((c) => !c.parent_id)
                            .map((cat) => {
                              const subCats = categories.filter((c) => c.parent_id === cat.id);
                              const isExpanded = !!expandedReportingCategories[cat.id];
                              
                              // Calculate item counts for top parent (itself + its subsection descendants)
                              let designCount = reportingCounts[cat.id] || 0;
                              subCats.forEach((sub) => {
                                designCount += reportingCounts[sub.id] || 0;
                              });

                              return (
                                <div
                                  key={cat.id}
                                  className={`flex flex-col bg-white border rounded-xl shadow-xs transition-all overflow-hidden ${
                                    isExpanded ? "border-gray-300 ring-1 ring-gray-100" : "border-gray-200/70 hover:border-gray-300"
                                  }`}
                                >
                                  {/* Section Card Header (Interactive Expand/Collapse) */}
                                  <div
                                    className="flex items-center justify-between p-3 cursor-pointer bg-white select-none hover:bg-gray-50/50 transition-colors"
                                    onClick={() => {
                                      setExpandedReportingCategories((prev) => ({
                                        ...prev,
                                        [cat.id]: !prev[cat.id],
                                      }));
                                    }}
                                  >
                                    <div className="flex items-center space-x-2 min-w-0">
                                      <ChevronRight
                                        size={14}
                                        strokeWidth={2.5}
                                        className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90 text-gray-600" : ""}`}
                                      />
                                      <span className="text-[11px] font-black tracking-wide uppercase text-gray-700 truncate">
                                        {cat.name}
                                      </span>
                                    </div>
                                    <span className={`font-mono min-w-[28px] text-center transition-all duration-200 select-none ${
                                      designCount === 0
                                        ? "text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5"
                                        : "text-xs font-black text-white bg-[#009f75] rounded-full px-3 py-0.5 shadow-xs border border-[#009f75]/10 scale-105"
                                    }`}>
                                      {designCount}
                                    </span>
                                  </div>

                                  {/* Expanding Inline Sub-items Box */}
                                  {isExpanded && (
                                    <div className="border-t border-gray-100 bg-gray-50/40 px-3 py-2 flex flex-col gap-1.5 animate-fade-in">
                                      {subCats.length === 0 ? (
                                        <div className="text-[10px] text-gray-400 italic py-1 pl-4">
                                          No subsegments
                                        </div>
                                      ) : (
                                        subCats.map((sub) => {
                                          const subCount = reportingCounts[sub.id] || 0;
                                          return (
                                            <div
                                              key={sub.id}
                                              className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-gray-150 rounded-lg hover:border-gray-200 transition-all"
                                            >
                                              <span className="text-[10px] font-bold text-gray-650 truncate max-w-[80%]">
                                                {sub.name}
                                              </span>
                                              <span className={`font-mono transition-all duration-200 ${
                                                subCount === 0
                                                  ? "text-[10px] font-semibold text-gray-400 bg-gray-100/70 rounded-md px-1.5 py-0.5"
                                                  : "text-[11px] font-black text-[#00805c] bg-[#e2f5ee] border border-[#a2ebd1]/60 rounded-md px-2 py-0.5 shadow-2xs scale-105"
                                              }`}>
                                                {subCount}
                                              </span>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {/* Compact Database Totals Summary Row */}
                      {categories.filter((c) => !c.parent_id).length > 0 && (
                        <div className="mt-5 pt-4 border-t border-gray-200/60 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-gray-500 select-none">
                          <div className="flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                              <span>Total Main Sections: <span className="text-gray-950 font-black">{categories.filter((c) => !c.parent_id).length}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                              <span>Total Subsegments: <span className="text-gray-950 font-black">{categories.filter((c) => !!c.parent_id).length}</span></span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50/60 rounded-lg border border-green-200/20 text-[#009f75]">
                            <span>Cumulative Record Count: <span className="font-mono font-black text-sm">{
                              categories.filter((c) => !c.parent_id).reduce((acc, cat) => {
                                let sum = reportingCounts[cat.id] || 0;
                                categories.filter((c) => c.parent_id === cat.id).forEach((sub) => {
                                  sum += reportingCounts[sub.id] || 0;
                                });
                                return acc + sum;
                              }, 0)
                            }</span></span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
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
                    <h2 className="text-lg font-bold text-gray-900">
                      Edit Prompt Instruction
                    </h2>
                    <p className="text-xs text-gray-500 font-medium">
                      Fine-tune the AI for '{editingPrompt.label}'
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Instruction Text
                  </label>
                  <textarea
                    value={editingPrompt.instruction}
                    onChange={(e) =>
                      setEditingPrompt({
                        ...editingPrompt,
                        instruction: e.target.value,
                      })
                    }
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
                    if (!editingPrompt.instruction.trim()) return;
                    try {
                      await fetch(`/api/prompts/${editingPrompt.key}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          instruction: editingPrompt.instruction,
                        }),
                      });
                      await fetchPrompts();
                      setEditingPrompt(null);
                    } catch (e) {
                      console.error("Failed to update prompt", e);
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
            <div
              className={`w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 ${
                theme === "dark"
                  ? "bg-[#1e2023] border border-[#2d2f31]"
                  : "bg-white"
              }`}
            >
              <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-2xl bg-green-100 text-[#009f75]">
                    <Pencil size={20} />
                  </div>
                  <div>
                    <h3
                      className={`text-xl font-black ${theme === "dark" ? "text-white" : "text-gray-900"}`}
                    >
                      Edit News Content
                    </h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                      ID: #{isEditingNews.id} • {isEditingNews.type} News
                    </p>
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
                  <label
                    className={`text-xs font-black uppercase tracking-widest ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
                  >
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
                      onClick={() =>
                        document
                          .getElementById("edit-news-image-upload")
                          ?.click()
                      }
                      disabled={isProcessingImage}
                      className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${
                        theme === "dark"
                          ? "bg-white/5 text-gray-300 hover:bg-white/10"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      } disabled:opacity-50`}
                    >
                      {isProcessingImage ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <ImageIcon size={12} />
                      )}
                      <span>
                        {editingNewsImages.length > 0
                          ? `Add Images (${editingNewsImages.length})`
                          : "Add Images"}
                      </span>
                    </button>
                    <div
                      className={`h-4 w-[1px] ${theme === "dark" ? "bg-[#2d2f31]" : "bg-gray-200"}`}
                    />
                    <span className="text-[10px] text-gray-400 font-bold italic">
                      Paste images directly
                    </span>
                  </div>
                </div>
                <textarea
                  value={editingNewsContent}
                  onChange={(e) => setEditingNewsContent(e.target.value)}
                  onPaste={handleImagePaste}
                  className={`w-full h-64 p-6 rounded-2xl border-2 font-medium text-base resize-none focus:outline-none focus:ring-4 focus:ring-[#009f75]/10 custom-scrollbar transition-all ${
                    theme === "dark"
                      ? "bg-[#151719] border-[#2d2f31] text-gray-200 focus:border-[#009f75]"
                      : "bg-gray-50 border-gray-100 text-gray-800 focus:border-[#009f75] focus:bg-white"
                  }`}
                  placeholder="Paste or type more content here..."
                />

                {editingNewsImages.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 rounded-xl bg-black/5">
                    {editingNewsImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-300 group shadow-sm bg-white"
                      >
                        <img src={img} className="w-full h-full object-cover" />
                        <button
                          onClick={() =>
                            setEditingNewsImages((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                    {isProcessingImage && (
                      <div className="w-20 h-20 rounded-lg border border-dashed border-gray-300 flex items-center justify-center animate-pulse bg-white/10">
                        <Loader2
                          size={20}
                          className="animate-spin text-gray-400"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className={`p-8 border-t flex justify-end space-x-4 ${theme === "dark" ? "border-[#2d2f31] bg-[#1a1c1e]" : "border-gray-100 bg-gray-50"}`}
              >
                <button
                  onClick={() => setIsEditingNews(null)}
                  className={`px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${
                    theme === "dark"
                      ? "text-gray-400 hover:bg-white/5"
                      : "text-gray-500 hover:bg-gray-200"
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
                theme === "dark"
                  ? "bg-[#1e2023] border border-[#2d2f31]"
                  : "bg-white"
              }`}
            >
              <div
                className={`p-6 border-b flex items-center justify-between ${theme === "dark" ? "bg-[#1e2023] border-[#2d2f31]" : "bg-[#f8f9fa] border-gray-100"}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-[#009f75] text-white">
                    <PanelTop size={18} />
                  </div>
                  <div>
                    <h3
                      className={`text-base font-black ${theme === "dark" ? "text-white" : "text-gray-900 uppercase"}`}
                    >
                      Header & Footer
                    </h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      {hfEditingCategory.name}
                    </p>
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
                    <label className="text-[11px] font-black uppercase tracking-widest text-[#6c7d8f]">
                      Header Text
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={isHfHeaderActive}
                        onChange={(e) => setIsHfHeaderActive(e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#009f75]"></div>
                      <span className="ml-2 text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                        {isHfHeaderActive ? "Active" : "Inactive"}
                      </span>
                    </label>
                  </div>

                  <RichEditor
                    value={hfHeader}
                    onChange={setHfHeader}
                    placeholder="Enter header text..."
                    theme={theme}
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-0.5">
                    <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">
                      Insert Stamp:
                    </span>
                    <button
                      type="button"
                      onClick={() => insertHFTag("header", "{{DATE}}")}
                      className="px-2 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                      title="Inserts dynamic date placeholder {{DATE}} (updated automatically everyday)"
                    >
                      {"{{DATE}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertHFTag("header", "{{TIME}}")}
                      className="px-2 py-0.5 rounded text-[8px] font-bold bg-[#009f75]/10 text-[#009f75] dark:bg-[#009f75]/20 dark:text-[#00df95] border border-[#009f75]/25 hover:bg-[#009f75]/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                      title="Inserts dynamic time placeholder {{TIME}} (updated automatically in real-time)"
                    >
                      {"{{TIME}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertHFTag("header", "{{DATETIME}}")}
                      className="px-2 py-0.5 rounded text-[8px] font-bold bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                      title="Inserts dynamic date and time placeholder {{DATETIME}}"
                    >
                      {"{{DATETIME}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        insertHFTag("header", getStaticTimestamp())
                      }
                      className="px-2 py-0.5 rounded text-[8px] font-mono font-bold bg-gray-100 text-gray-650 dark:bg-[#2d2f31] dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-200/50 cursor-pointer select-none transition-all flex items-center space-x-1"
                      title="Inserts a fixed, un-changing current timestamp"
                    >
                      <span>⚡ Static</span>
                    </button>
                  </div>
                  {(hfHeader.includes("{{DATE}}") ||
                    hfHeader.includes("{{TIME}}") ||
                    hfHeader.includes("{{DATETIME}}") ||
                    hfHeader.includes("{{TIMESTAMP}}")) && (
                    <div className="mt-2 px-3 py-1.5 text-[10px] bg-amber-500/[0.04] text-amber-800 dark:bg-amber-500/[0.08] dark:text-amber-400 border border-amber-500/10 rounded-lg italic">
                      <strong className="not-italic font-black text-[9px] uppercase tracking-wider text-amber-600 mr-2">
                        Preview with Values:
                      </strong>
                      "{formatHFText(hfHeader)}"
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-widest text-[#6c7d8f]">
                      Footer Text
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={isHfFooterActive}
                        onChange={(e) => setIsHfFooterActive(e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#009f75]"></div>
                      <span className="ml-2 text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                        {isHfFooterActive ? "Active" : "Inactive"}
                      </span>
                    </label>
                  </div>

                  <RichEditor
                    value={hfFooter}
                    onChange={setHfFooter}
                    placeholder="Enter footer text..."
                    theme={theme}
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-0.5">
                    <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">
                      Insert Stamp:
                    </span>
                    <button
                      type="button"
                      onClick={() => insertHFTag("footer", "{{DATE}}")}
                      className="px-2 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                      title="Inserts dynamic date placeholder {{DATE}} (updated automatically everyday)"
                    >
                      {"{{DATE}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertHFTag("footer", "{{TIME}}")}
                      className="px-2 py-0.5 rounded text-[8px] font-bold bg-[#009f75]/10 text-[#009f75] dark:bg-[#009f75]/20 dark:text-[#00df95] border border-[#009f75]/25 hover:bg-[#009f75]/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                      title="Inserts dynamic time placeholder {{TIME}} (updated automatically in real-time)"
                    >
                      {"{{TIME}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertHFTag("footer", "{{DATETIME}}")}
                      className="px-2 py-0.5 rounded text-[8px] font-bold bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/15 cursor-pointer select-none transition-all uppercase tracking-wide"
                      title="Inserts dynamic date and time placeholder {{DATETIME}}"
                    >
                      {"{{DATETIME}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        insertHFTag("footer", getStaticTimestamp())
                      }
                      className="px-2 py-0.5 rounded text-[8px] font-mono font-bold bg-gray-100 text-gray-650 dark:bg-[#2d2f31] dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-200/50 cursor-pointer select-none transition-all flex items-center space-x-1"
                      title="Inserts a fixed, un-changing current timestamp"
                    >
                      <span>⚡ Static</span>
                    </button>
                  </div>
                  {(hfFooter.includes("{{DATE}}") ||
                    hfFooter.includes("{{TIME}}") ||
                    hfFooter.includes("{{DATETIME}}") ||
                    hfFooter.includes("{{TIMESTAMP}}")) && (
                    <div className="mt-2 px-3 py-1.5 text-[10px] bg-amber-500/[0.04] text-amber-800 dark:bg-amber-500/[0.08] dark:text-amber-400 border border-amber-500/10 rounded-lg italic">
                      <strong className="not-italic font-black text-[9px] uppercase tracking-wider text-amber-600 mr-2">
                        Preview with Values:
                      </strong>
                      "{formatHFText(hfFooter)}"
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`p-6 border-t flex items-center justify-end space-x-3 ${theme === "dark" ? "bg-[#1e2023] border-[#2d2f31]" : "bg-[#f8f9fa] border-gray-100"}`}
              >
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

        {/* Floating AI Refinement Focus Workspace Popup */}
        <AnimatePresence>
          {isFloatingRefinementOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                position: "fixed",
                left: `${floatingPos.x}px`,
                top: `${floatingPos.y}px`,
                width: `${floatingSize.width}px`,
                height: `${floatingSize.height}px`,
              }}
              className={`z-[200] rounded-2xl border flex flex-col overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] dark:shadow-[0_40px_80px_rgba(0,0,0,0.7)] ${
                theme === "dark"
                  ? "bg-[#1e2022] border-[#2e3134] text-white"
                  : "bg-white border-gray-200 text-gray-800"
              }`}
            >
              {/* Header (Draggable by holding anywhere not a form input) */}
              <div
                onMouseDown={handleDragStart}
                className={`h-14 px-5 shrink-0 flex items-center justify-between border-b select-none relative ${
                  isDraggingWorkspace ? "cursor-grabbing" : "cursor-grab"
                } ${
                  theme === "dark"
                    ? "bg-[#25272a] border-[#2e3134]"
                    : "bg-[#fcfcfa] border-gray-200"
                }`}
                title="Drag header to move window"
              >
                {/* Left Title */}
                <div className="flex items-center space-x-2.5">
                  <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Target
                      size={14}
                      className="text-amber-500 animate-pulse"
                    />
                  </div>
                  <div className="text-left">
                    <h3 className="text-xs font-black uppercase tracking-widest leading-none">
                      AI Refinement Focus Workspace
                    </h3>
                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mt-0.5">
                      Interactive Drag & Resize Control Center
                    </span>
                  </div>
                </div>

                {/* Drag instruction Pill indicator */}
                <div className="hidden sm:flex items-center space-x-1 bg-gray-100 dark:bg-[#1a1c1d] px-3 py-1 rounded-full text-[9px] font-bold text-gray-400 select-none animate-pulse">
                  <span>::</span>
                  <span>DRAG TO MOVE</span>
                  <span>::</span>
                </div>

                {/* Close & Save Button */}
                <button
                  onClick={() => setIsFloatingRefinementOpen(false)}
                  className="flex items-center space-x-1.5 px-4 h-9 rounded-xl bg-[#009f75] hover:bg-[#008f65] text-white transition-all shadow-md shadow-[#009f75]/20 hover:scale-[1.02] cursor-pointer select-none"
                  title="Save session and exit workspace"
                  id="workspace-close-btn"
                >
                  <Check size={14} className="stroke-[3]" />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Save & Exit
                  </span>
                </button>
              </div>
              <div className="flex-1 flex flex-row overflow-hidden min-h-0">
                {/* Left Panel: Sidebar list of custom instructions */}
                <div
                  className={`w-[260px] flex flex-col shrink-0 border-r overflow-hidden ${
                    theme === "dark"
                      ? "bg-[#181a1c] border-[#2e3134]"
                      : "bg-gray-50/50 border-gray-200"
                  }`}
                >
                  {/* Sidebar scrollable list */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
                    {customRefinements.map((item) => {
                      const isSelected = selectedRefinementIds.includes(
                        item.id,
                      );
                      const isActiveEd =
                        workspaceActiveItemId === item.id &&
                        !workspaceIsNewItem;

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setWorkspaceActiveItemId(item.id);
                            setWorkspaceIsNewItem(false);
                          }}
                          className={`p-3 rounded-xl border text-[11px] flex flex-col transition-all cursor-pointer relative select-none group/wsitem ${
                            isActiveEd
                              ? "bg-amber-500/15 border-amber-500 text-amber-500 ring-1 ring-amber-500/20"
                              : isSelected
                                ? "bg-amber-500/5 border-amber-500/50 text-amber-655 dark:text-amber-400 hover:border-amber-500"
                                : theme === "dark"
                                  ? "bg-[#222426]/70 border-[#2e3134] text-gray-300 hover:border-gray-600"
                                  : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          {/* Inner Top Title Row */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center space-x-1.5">
                              {/* Selection switch */}
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRefinementIds((prev) =>
                                    prev.includes(item.id)
                                      ? prev.filter((id) => id !== item.id)
                                      : [...prev, item.id],
                                  );
                                }}
                                className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center text-[8px] font-black transition-all shrink-0 cursor-pointer ${
                                  isSelected
                                    ? "bg-amber-600 border-amber-600 text-white"
                                    : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1b1d]"
                                } hover:scale-105`}
                                title="Toggle selection"
                              >
                                {isSelected && "✓"}
                              </span>

                              <span className="text-[8px] uppercase tracking-wider font-extrabold text-gray-400">
                                ID {item.id}
                              </span>
                            </div>

                            {/* Deletion icon on hover */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    "Are you sure you want to delete this focus preset?",
                                  )
                                ) {
                                  handleDeleteCustomRefinement(item.id);
                                  if (workspaceActiveItemId === item.id) {
                                    setWorkspaceActiveItemId(null);
                                  }
                                }
                              }}
                              className="opacity-0 group-hover/wsitem:opacity-100 p-0.5 hover:text-red-500 text-gray-400 transition-all rounded cursor-pointer"
                              title="Delete preset"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>

                          {/* Line-clamped summary text */}
                          <p className="line-clamp-2 leading-relaxed font-semibold text-left select-none break-words pr-1">
                            {item.instruction}
                          </p>

                          {/* Elaborated prompt indicator */}
                          {item.elaborated_prompt &&
                            item.elaborated_prompt.trim() && (
                              <div className="mt-1.5 flex select-none">
                                <span className="px-1.5 py-0.2 rounded text-[7px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  ELABORATED
                                </span>
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Sidebar "+ Create New Focus Preset" shifted below list */}
                  <div
                    className={`p-3 border-t ${theme === "dark" ? "border-[#2e3134]" : "border-gray-200"}`}
                  >
                    <button
                      onClick={() => {
                        setWorkspaceActiveItemId(null);
                        setWorkspaceIsNewItem(true);
                      }}
                      className={`w-full flex items-center justify-center space-x-1.5 py-1.5 border border-dashed rounded-xl text-[10.5px] font-black tracking-widest uppercase transition-all cursor-pointer ${
                        workspaceIsNewItem
                          ? "border-amber-500 text-amber-500 bg-amber-500/10"
                          : theme === "dark"
                            ? "border-gray-700 text-gray-300 hover:border-[#009f75] hover:text-[#009f75] hover:bg-[#009f75]/5"
                            : "border-gray-300 text-gray-600 hover:border-[#009f75] hover:text-[#009f75] hover:bg-[#009f75]/5"
                      }`}
                    >
                      <Plus size={11} strokeWidth={3} />
                      <span>Create New Focus</span>
                    </button>
                  </div>
                </div>

                {/* Right Panel: Detail Editor */}
                <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 bg-white dark:bg-[#1a1c1e]">
                  {workspaceIsNewItem || workspaceActiveItemId !== null ? (
                    <div className="flex flex-col space-y-6 h-full text-left">
                      {/* Workspace editor Title */}
                      <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2e3134] pb-4 shrink-0">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider flex items-center space-x-2">
                            <span
                              className={
                                workspaceIsNewItem
                                  ? "text-[#009f75]"
                                  : "text-amber-500"
                              }
                            >
                              {workspaceIsNewItem
                                ? "Create New AI Focus Parameter"
                                : "Edit AI Focus Parameter"}
                            </span>
                            {!workspaceIsNewItem && (
                              <span className="text-xs text-gray-400 font-bold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800">
                                #{workspaceActiveItemId}
                              </span>
                            )}
                          </h4>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1 leading-none">
                            Configure prompt context directive for the AI engine
                          </p>
                        </div>

                        {/* Active Toggle Status inside editor */}
                        {workspaceActiveItemId !== null &&
                          !workspaceIsNewItem && (
                            <div className="flex items-center space-x-2">
                              <span className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">
                                Status:
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedRefinementIds((prev) =>
                                    prev.includes(workspaceActiveItemId)
                                      ? prev.filter(
                                          (id) => id !== workspaceActiveItemId,
                                        )
                                      : [...prev, workspaceActiveItemId],
                                  );
                                }}
                                className={`px-3 py-1 text-[9px] font-black tracking-widest uppercase rounded-full border transition-all cursor-pointer ${
                                  selectedRefinementIds.includes(
                                    workspaceActiveItemId,
                                  )
                                    ? "bg-amber-500/15 text-amber-500 border-amber-500"
                                    : "bg-transparent text-gray-400 border-gray-200 dark:border-gray-800 hover:text-amber-500 hover:border-amber-500/50"
                                }`}
                              >
                                {selectedRefinementIds.includes(
                                  workspaceActiveItemId,
                                )
                                  ? "Active"
                                  : "Inactive"}
                              </button>
                            </div>
                          )}
                      </div>

                      {/* Single Big Empty Input Box */}
                      <div className="flex-1 flex flex-col min-h-0">
                        <textarea
                          value={workspaceEditingText}
                          onChange={(e) =>
                            setWorkspaceEditingText(e.target.value)
                          }
                          placeholder="Write your custom focus instruction or prompt context rule here (e.g. Focus on support, resistance key indicators and domestic events)..."
                          className={`w-full flex-1 p-5 rounded-2xl text-xs font-semibold outline-none resize-none focus:ring-2 focus:ring-[#009f75]/30 custom-scrollbar ${
                            theme === "dark"
                              ? "bg-[#222426] border border-[#2e3134] text-white focus:border-[#009f75]"
                              : "bg-gray-50 border border-gray-200 text-gray-850 focus:border-[#009f75] focus:bg-white"
                          }`}
                          id="workspace-single-input-box"
                        />
                      </div>

                      {/* Form Controls */}
                      <div className="flex items-center justify-between border-t border-gray-100 dark:border-[#2e3134] pt-4 shrink-0 mt-auto">
                        <div className="flex items-center">
                          {workspaceSaveSuccess && (
                            <motion.span
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider flex items-center space-x-1"
                            >
                              <Check size={11} className="stroke-[3]" />
                              <span>Saved to Database!</span>
                            </motion.span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => {
                              setWorkspaceActiveItemId(null);
                              setWorkspaceIsNewItem(false);
                            }}
                            className={`px-4 py-2 text-[10px] uppercase font-black tracking-widest transition-all cursor-pointer ${
                              theme === "dark"
                                ? "text-gray-400 hover:bg-white/5"
                                : "text-gray-500 hover:bg-gray-150"
                            } rounded-xl`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              if (!workspaceEditingText.trim()) {
                                alert("Focus Instruction is required!");
                                return;
                              }
                              if (workspaceIsNewItem) {
                                await handleCreateRefinementFromWorkspace(
                                  workspaceEditingText,
                                  null,
                                );
                              } else if (workspaceActiveItemId !== null) {
                                await handleUpdateCustomRefinementElaborated(
                                  workspaceActiveItemId,
                                  workspaceEditingText,
                                  null,
                                );
                                setWorkspaceSaveSuccess(true);
                                setTimeout(
                                  () => setWorkspaceSaveSuccess(false),
                                  2000,
                                );
                              }
                            }}
                            className="px-6 py-2.5 bg-[#009f75] hover:bg-[#008f65] text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-[#009f75]/10 hover:scale-[1.02] cursor-pointer"
                          >
                            {workspaceIsNewItem
                              ? "Create Focus Item"
                              : "Save Changes"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center m-auto max-w-sm">
                      <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                        <Target size={22} className="animate-pulse" />
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-widest mb-1">
                        No Parameter Highlighted
                      </h4>
                      <p className="text-[10.5px] text-gray-400 dark:text-gray-500 font-bold tracking-tight leading-relaxed mb-4">
                        Select an existing AI focus preset from the left sidebar
                        index or click the button below to design a custom
                        workspace refinement.
                      </p>
                      <button
                        onClick={() => {
                          setWorkspaceActiveItemId(null);
                          setWorkspaceIsNewItem(true);
                        }}
                        className="px-5 py-2 hover:scale-[1.02] bg-[#009f75] hover:bg-[#008f55] text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer"
                      >
                        Create Custom Focus Parameter
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Resize corner handle */}
              <div
                onMouseDown={handleResizeStart}
                className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 select-none z-[210]"
                title="Drag here to adjust workspace dimensions"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  className="text-gray-400 dark:text-gray-600"
                >
                  <line
                    x1="6"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <line
                    x1="6"
                    y1="3"
                    x2="3"
                    y2="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
