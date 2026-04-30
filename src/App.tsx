/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Copy, Maximize2, GripVertical, Pickaxe, Droplets, Sprout, Settings, History, FileText, Send, Loader2, Clock, Sparkles, Plus, Trash2, RotateCcw, Trash, PlusCircle, Check, ChevronRight, ChevronDown, Calendar, Database, MessageSquare, ArrowLeft, Video, Phone, MoreVertical, Smile, Paperclip, Camera, Mic, Key, Settings2, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
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
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  const [reportsList, setReportsList] = useState<ReportItem[]>([]);
  const [trashItems, setTrashItems] = useState<{ news: NewsItem[], reports: ReportItem[] }>({ news: [], reports: [] });
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportSource, setReportSource] = useState<'raw' | 'refined' | 'master'>('refined');
  const [newsForReport, setNewsForReport] = useState<NewsItem[]>([]);
  const [selectedNewsIds, setSelectedNewsIds] = useState<Set<number>>(new Set());
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
  
  // Left Panel Expansion States
  const [isRawInputExpanded, setIsRawInputExpanded] = useState(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [isReportConfigExpanded, setIsReportConfigExpanded] = useState(true);
  const [isReportSelectionExpanded, setIsReportSelectionExpanded] = useState(true);

  // Right Panel Expansion States
  const [isIntelligenceInstructionsExpanded, setIsIntelligenceInstructionsExpanded] = useState(true);
  const [isIntelligencePreviewExpanded, setIsIntelligencePreviewExpanded] = useState(true);
  const [isIntelligenceRawExpanded, setIsIntelligenceRawExpanded] = useState(true);
  
  const [isReportInstructionsExpanded, setIsReportInstructionsExpanded] = useState(true);
  const [isReportPreviewExpanded, setIsReportPreviewExpanded] = useState(true);

  const [customAddOns, setCustomAddOns] = useState<{id: string, label: string, enabled: boolean}[]>([]);
  const [isAddingAddOn, setIsAddingAddOn] = useState(false);
  const [newAddOnLabel, setNewAddOnLabel] = useState('');
  const [feedFilter, setFeedFilter] = useState<'all' | 'raw' | 'refined'>('all');
  const [reportInstructions, setReportInstructions] = useState('');
  const [refineInstructions, setRefineInstructions] = useState('');
  const [demoDaysAgo, setDemoDaysAgo] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<'all' | '7days' | '30days' | 'custom'>('all');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'whatsapp'>('whatsapp');
  const [reportZoom, setReportZoom] = useState(1);
  const [newsZoom, setNewsZoom] = useState(1);
  const [rawTextZoom, setRawTextZoom] = useState(1);
  const [isWhatsAppExpanded, setIsWhatsAppExpanded] = useState(false);
  
  const [reportOptions, setReportOptions] = useState({
    withHeadline: true,
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

  const [refineOptions, setRefineOptions] = useState({
    withHeadline: true,
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

  const [sidebarWidth, setSidebarWidth] = useState(200); // Pixels
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
        } else if (!activeCategoryId) {
          const current = data.find((c: any) => c.name === activeCategory);
          if (current) setActiveCategoryId(current.id);
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

  const callGeminiWithFallback = async (prompt: string, schema?: any) => {
    const activeKeys = apiKeys.filter(k => k.is_active === 1).sort((a, b) => a.sort_order - b.sort_order);
    
    // If no keys in DB, use environment variable
    if (activeKeys.length === 0) {
      const fallbackAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const config: any = {};
      if (schema) {
        config.responseMimeType = "application/json";
        config.responseSchema = schema;
      }
      const res = await fallbackAi.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
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
          model: "gemini-2.5-flash",
          contents: prompt,
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
  }, [fetchCategories, fetchApiKeys, fetchPrompts]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setAddingToParentId(null);
      return;
    }

    // Duplicate check
    const exists = categories.some(c => !c.parent_id && c.name.toLowerCase() === newCategoryName.trim().toLowerCase());
    if (exists) {
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

  const handleAddSubCategory = async (parentId: number) => {
    if (!newCategoryName.trim()) {
      setAddingToParentId(null);
      return;
    }

    // Duplicate check
    const exists = categories.some(c => c.parent_id === parentId && c.name.toLowerCase() === newCategoryName.trim().toLowerCase());
    if (exists) {
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

  const toggleCategory = (id: number) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Fetch news feed for the active category
  const fetchFeed = useCallback(async () => {
    if (!activeCategoryId) return;
    setIsLoadingFeed(true);
    try {
      const response = await fetch(`/api/news/${activeCategoryId}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setNewsFeed(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch news feed:', error);
      setNewsFeed([]);
    } finally {
      setIsLoadingFeed(false);
    }
  }, [activeCategoryId]);

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
    } else if (viewMode === 'reports') {
      fetchReports();
    } else if (viewMode === 'trash') {
      fetchTrash(activeCategoryId);
    }
  }, [fetchFeed, fetchReports, fetchTrash, viewMode, activeCategoryId]);

  const handleProcess = async () => {
    if (!inputText.trim() || !activeCategoryId) return;
    
    setIsProcessing(true);
    try {
      const response = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category_id: activeCategoryId, 
          category_name: activeCategory,
          raw_text: inputText,
          type: 'raw'
        }),
      });
      
      if (response.ok) {
        setInputText('');
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
    if (!item.raw_text) return;
    
    setIsRefining(true);
    try {
      const prompt = `
        You are a senior commodity market analyst. Refine the following raw news intelligence for the ${activeCategory} market.
        
        RAW NEWS:
        ${item.raw_text}
        
        INSTRUCTIONS:
        ${refineOptions.withHeadline && promptTemplates['headline_format'] ? promptTemplates['headline_format'].instruction : ""}
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
      `;

      const aiResponse = await callGeminiWithFallback(prompt, {
        type: Type.OBJECT,
        properties: {
          summary_en: { type: Type.STRING },
          summary_hi: { type: Type.STRING },
        },
        required: ['summary_en', 'summary_hi'],
      });

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
        return text
          .replace(/\*\*(.*?)\*\*/g, '*$1*') // Bold
          .replace(/__(.*?)__/g, '_$1_')     // Italic
          .replace(/^### (.*$)/gm, '*$1*')   // H3 as Bold
          .replace(/^## (.*$)/gm, '*$1*')    // H2 as Bold
          .replace(/^# (.*$)/gm, '*$1*')     // H1 as Bold
          .replace(/^- (.*$)/gm, '• $1');    // Bullets
      };

      const formattedContent = formatForWhatsApp(content);
      await navigator.clipboard.writeText(formattedContent);
      
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
        const newWidth = e.clientX;
        if (newWidth >= 60 && newWidth <= 400) {
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

  const groupNewsByDate = (news: NewsItem[]) => {
    const groups: Record<string, NewsItem[]> = {};
    
    news.forEach(item => {
      const date = new Date(item.created_at);
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
    
    if (historyFilter === 'all') return true;
    
    const itemDate = new Date(item.created_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (historyFilter === '7days') return diffDays <= 7;
    if (historyFilter === '30days') return diffDays <= 30;
    if (historyFilter === 'custom' && customDateRange?.from) {
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
    ? new Date(Math.min(...newsFeed.map(item => new Date(item.created_at).getTime())))
    : undefined;
  const disabledDays = oldestNewsDate ? [
    { before: startOfDay(oldestNewsDate) },
    { after: endOfDay(new Date()) }
  ] : [];

  return (
    <>
      <div className="flex h-screen w-screen overflow-hidden bg-gray-200 font-sans text-gray-900">
        {/* --- Sidebar (Navigation Rail) --- */}
        <aside 
          className="flex flex-col border-r border-gray-300 bg-white py-6 shadow-md relative group/sidebar"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Sidebar Resize Handle */}
        <div 
          onMouseDown={() => setIsResizingSidebar(true)}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-green-500/30 transition-colors z-50"
        />

        <div className="px-4 mb-8 flex items-center justify-center">
          <div className="flex h-12 w-full items-center justify-center rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 text-gray-400 overflow-hidden">
            <img 
              src="https://picsum.photos/seed/logo/200/50" 
              alt="Demo Logo" 
              className="h-full w-full object-cover opacity-80"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
        
        <div className="px-4 mb-4 flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Market Sections</h3>
          <button 
            onClick={() => setAddingToParentId('root')}
            disabled={isAddingCategory}
            className="flex h-6 items-center space-x-1 px-2 rounded bg-green-100 text-green-800 hover:bg-green-200 transition-all disabled:opacity-50"
            title="Add New Section"
          >
            <Plus size={12} />
            <span className="text-[10px] font-bold">Add</span>
          </button>
        </div>

        {addingToParentId === 'root' && (
          <div className="px-4 mb-4">
            <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg border border-gray-300">
              <input
                autoFocus
                type="text"
                placeholder="Section name..."
                className="flex-1 bg-transparent text-xs px-2 py-1 outline-none"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') setAddingToParentId(null);
                }}
              />
              <button 
                onClick={handleAddCategory}
                className="p-1 text-green-600 hover:bg-green-100 rounded"
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        )}

        <nav className="flex flex-1 flex-col space-y-1 px-2 overflow-y-auto">
          {categories.filter(c => !c.parent_id).map((cat) => {
            const subCats = categories.filter(c => c.parent_id === cat.id);
            const isExpanded = expandedCategories[cat.id];
            
            return (
              <div key={cat.id} className="flex flex-col space-y-1">
                <div
                  className={`group relative flex items-center justify-between px-4 py-3 rounded-lg transition-all cursor-pointer ${
                    activeCategory === cat.name 
                      ? 'bg-gray-900 text-white shadow-md' 
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  onClick={() => {
                    setActiveCategory(cat.name);
                    setActiveCategoryId(cat.id);
                    setSelectedNews(null);
                    setSelectedReport(null);
                    // Toggle expansion when clicking the row
                    toggleCategory(cat.id);
                  }}
                >
                  <span className="text-sm font-bold truncate">{cat.name}</span>
                  
                  <div className="flex items-center space-x-1 ml-auto">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setAddingToParentId(cat.id);
                        setNewCategoryName('');
                        // Ensure parent is expanded when adding a sub-section
                        if (!expandedCategories[cat.id]) {
                          toggleCategory(cat.id);
                        }
                      }}
                      className={`p-1 rounded-md transition-all ${
                        activeCategory === cat.name 
                          ? 'text-white/70 hover:text-white hover:bg-white/20' 
                          : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                      }`}
                      title="Add Sub-section"
                    >
                      <Plus size={18} strokeWidth={2.5} />
                    </button>
                    
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleCategory(cat.id);
                      }}
                      className={`p-1 rounded-md transition-all ${
                        activeCategory === cat.name 
                          ? 'text-white/70 hover:text-white hover:bg-white/20' 
                          : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                      }`}
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDown size={18} strokeWidth={2.5} />
                      ) : (
                        <ChevronRight size={18} strokeWidth={2.5} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Sub-category Input */}
                {addingToParentId === cat.id && (
                  <div className="ml-4 px-2 py-1">
                    <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Sub-section name..."
                        className="flex-1 bg-transparent text-xs px-2 py-1 outline-none"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddSubCategory(cat.id);
                          if (e.key === 'Escape') setAddingToParentId(null);
                        }}
                      />
                      <button 
                        onClick={() => handleAddSubCategory(cat.id)}
                        className="p-1 text-green-600 hover:bg-green-100 rounded"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-categories */}
                {isExpanded && subCats.length > 0 && (
                  <div className="ml-4 flex flex-col space-y-1 border-l-2 border-gray-100 pl-2">
                    {subCats.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setActiveCategory(sub.name);
                          setActiveCategoryId(sub.id);
                          setSelectedNews(null);
                          setSelectedReport(null);
                        }}
                        className={`flex items-center px-4 py-2 rounded-lg transition-all ${
                          activeCategory === sub.name 
                            ? 'bg-green-50 text-green-900 font-bold' 
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className="text-xs truncate">{sub.name}</span>
                        {activeCategory === sub.name && (
                          <div className="ml-auto h-1 w-1 rounded-full bg-green-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          
          <div className="h-px bg-gray-200 my-4 mx-2" />
        </nav>

        <div className="mt-auto flex flex-col items-center space-y-4 pt-4 border-t border-gray-100">
          <button 
            onClick={() => setViewMode('trash')}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
              viewMode === 'trash' ? 'bg-gray-200 text-gray-900 shadow-inner' : 'text-gray-600 hover:bg-gray-100'
            }`} 
            title="Trash"
          >
            <Trash2 size={20} />
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all" title="History">
            <History size={20} />
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all" 
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </aside>

      {/* --- Main Dashboard Area --- */}
      <main 
        ref={containerRef}
        className={`flex flex-1 overflow-hidden ${isResizing ? 'cursor-col-resize select-none' : ''}`}
      >
        {/* Left Panel: Raw News Feed / Input */}
        <div 
          className={`flex flex-col bg-white border-r border-gray-300 transition-all duration-300 ease-in-out ${maximizedPanel === 'right' ? 'hidden' : ''}`}
          style={{ width: maximizedPanel === 'left' ? '100%' : maximizedPanel === 'right' ? '0%' : `${leftWidth}%` }}
        >
          {/* Toolbar */}
          <header className={`flex h-14 items-center justify-between border-b border-gray-300 px-6 shadow-md transition-colors duration-300 ${
            viewMode === 'trash' ? 'bg-gray-800 text-white' : 'bg-green-900 text-white'
          }`}>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => toggleMaximize('left')}
                className={`p-1.5 rounded-lg transition-colors ${
                  maximizedPanel === 'left' 
                    ? 'bg-white/20 text-white' 
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Maximize2 size={18} />
              </button>
              <h2 className="text-sm font-black uppercase tracking-widest">
                {viewMode === 'trash' ? `Trash Bin` : activeCategory}
              </h2>
            </div>

            {viewMode === 'trash' && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setViewMode('intelligence')}
                  className="flex items-center space-x-2 px-4 py-1.5 rounded-md text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition-all border border-white/30"
                >
                  <RotateCcw size={14} />
                  <span>Exit Trash</span>
                </button>
              </div>
            )}
          </header>

          {/* Sub-header Tabs (Refined Green Theme) */}
          {viewMode !== 'trash' && (
            <div className="flex h-11 bg-[#022c22] text-white border-b border-white/5 shadow-sm">
              <button
                onClick={() => setViewMode('intelligence')}
                className={`flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-[0.25em] transition-all border-r border-white/5 ${
                  viewMode === 'intelligence' 
                    ? 'bg-white/[0.03] text-white border-b-2 border-green-400 shadow-[inset_0_-4px_12px_-4px_rgba(74,222,128,0.2)]' 
                    : 'text-emerald-500/40 hover:text-emerald-200 hover:bg-white/[0.02]'
                }`}
              >
                Intelligence
              </button>
              <button
                onClick={() => setViewMode('reports')}
                className={`flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-[0.25em] transition-all ${
                  viewMode === 'reports' 
                    ? 'bg-white/[0.03] text-white border-b-2 border-green-400 shadow-[inset_0_-4px_12px_-4px_rgba(74,222,128,0.2)]' 
                    : 'text-emerald-500/40 hover:text-emerald-200 hover:bg-white/[0.02]'
                }`}
              >
                Report
              </button>
            </div>
          )}
          
          {/* Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {viewMode === 'intelligence' ? (
              <>
                {/* Input Area */}
                <div className="bg-gray-100 border-b border-gray-300">
                  <div 
                    onClick={() => setIsRawInputExpanded(!isRawInputExpanded)}
                    className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-200/50 transition-colors"
                  >
                    <span className="text-xs font-mono text-gray-700 uppercase tracking-tighter font-bold">Raw Intelligence Input</span>
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] bg-gray-300 px-2 py-0.5 rounded text-gray-900 font-bold tracking-tight">Auto-Detect: ON</span>
                      <div className={`transform transition-transform duration-300 ${isRawInputExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={16} className="text-gray-500" />
                      </div>
                    </div>
                  </div>
                  {isRawInputExpanded && (
                    <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <textarea 
                        value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="w-full h-32 p-4 resize-none border border-gray-300 rounded-xl bg-white text-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent font-medium transition-all shadow-sm"
                    placeholder={`Paste ${activeCategory} news here...`}
                  />
                  <div className="mt-4 flex justify-end items-center space-x-3">
                    <div className="flex items-center space-x-2 bg-white border border-gray-300 rounded-full px-3 py-1.5 shadow-sm">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Days Ago:</span>
                      <select 
                        value={demoDaysAgo}
                        onChange={(e) => setDemoDaysAgo(parseInt(e.target.value))}
                        className="bg-transparent text-xs font-bold text-green-800 outline-none cursor-pointer"
                      >
                        {[...Array(31)].map((_, i) => (
                          <option key={i} value={i}>{i === 0 ? 'Today' : i}</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      onClick={handleAddDemoNews}
                      disabled={isProcessing}
                      className="flex items-center space-x-2 rounded-full border-2 border-green-800 px-6 py-2.5 text-sm font-bold text-green-800 hover:bg-green-50 transition-all disabled:opacity-50"
                    >
                      <span>Add Demo News</span>
                      <PlusCircle size={16} />
                    </button>
                    <button 
                      onClick={handleProcess}
                      disabled={isProcessing || !inputText.trim()}
                      className="flex items-center space-x-2 rounded-full bg-green-800 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-green-100 hover:bg-green-900 hover:shadow-green-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? (
                        <>
                          <span>Saving...</span>
                          <Loader2 size={16} className="animate-spin" />
                        </>
                      ) : (
                        <>
                          <span>Add Raw News</span>
                          <PlusCircle size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* History Feed */}
            <div className={`flex flex-col bg-white ${isHistoryExpanded ? 'flex-1 overflow-hidden' : 'border-b border-gray-200'}`}>
              <div 
                className="flex items-center justify-between px-6 sticky top-0 bg-white z-20 py-4 border-b border-gray-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('select') || (e.target as HTMLElement).closest('.rdp') || (e.target as HTMLElement).closest('button')) return;
                  setIsHistoryExpanded(!isHistoryExpanded);
                }}
              >
                <div className="flex items-center space-x-4 relative">
                  <div className="flex items-center space-x-2">
                    <Clock size={16} className="text-gray-900" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-700">Intelligence History</span>
                  </div>
                  
                  <select 
                    value={historyFilter}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setHistoryFilter(val);
                      if (val === 'custom') {
                        setIsCalendarOpen(true);
                      } else {
                        setIsCalendarOpen(false);
                      }
                    }}
                    className="text-[10px] font-bold uppercase tracking-tighter bg-gray-100 px-2 py-1 rounded border-none outline-none text-gray-600 cursor-pointer hover:bg-gray-200 transition-colors"
                  >
                    <option value="all">All History</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                    <option value="custom">Custom Dates</option>
                  </select>

                  {historyFilter === 'custom' && customDateRange?.from && (
                    <div 
                      className="text-[10px] font-bold text-green-700 cursor-pointer hover:underline"
                      onClick={() => setIsCalendarOpen(true)}
                    >
                      {format(customDateRange.from, 'MMM d, yyyy')} {customDateRange.to && `— ${format(customDateRange.to, 'MMM d, yyyy')}`}
                    </div>
                  )}

                  {isCalendarOpen && (
                    <div 
                      ref={calendarRef}
                      className="absolute top-10 left-10 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-2"
                    >
                      <DayPicker
                        mode="range"
                        selected={customDateRange}
                        onSelect={(range) => {
                          setCustomDateRange(range);
                        }}
                        disabled={disabledDays}
                        className="bg-white"
                      />
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-4">
                  {/* Feed Filter Radio Buttons */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-1">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'raw', label: 'Raw' },
                      { id: 'refined', label: 'Refined' }
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={(e) => { e.stopPropagation(); setFeedFilter(f.id as any); }}
                        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-tighter rounded-md transition-all ${
                          feedFilter === f.id 
                            ? 'bg-white text-green-800 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  
                  <div className={`transform transition-transform duration-300 ${isHistoryExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={16} className="text-gray-500" />
                  </div>
                </div>
              </div>

              {isHistoryExpanded && (
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
                            <div className="h-[1px] flex-1 bg-gray-200" />
                            <span className="text-[10px] font-black text-gray-400 tracking-[0.2em]">{formatDateHeading(dateStr)}</span>
                            <div className="h-[1px] flex-1 bg-gray-200" />
                          </div>
                          
                          <div className="space-y-4">
                            {newsGroups[dateStr].map((item) => (
                              <div
                                key={item.id}
                                className={`group relative w-full p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col ${
                                  selectedNews?.id === item.id 
                                    ? 'border-green-500 bg-green-50 shadow-md' 
                                    : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                                } ${expandedNewsIds.has(item.id) ? 'h-64' : 'h-auto'}`}
                                onClick={() => {
                                  setSelectedNews(item);
                                  setSelectedReport(null);
                                }}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs font-mono text-gray-700 font-bold">
                                      {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}, {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {item.type === 'refined' && (
                                      <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter flex items-center">
                                        <ChevronRight size={10} className="mr-0.5" />
                                        Refined from #{item.parent_id}
                                      </span>
                                    )}
                                    {item.type === 'raw' && (
                                      <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                                        Raw #{item.id}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {item.summary_en && (
                                      <span className="text-[10px] bg-green-800 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow-sm">Refined</span>
                                    )}
                                    <button
                                      onClick={(e) => toggleExpandNews(item.id, e)}
                                      className={`p-1 rounded-md transition-colors ${expandedNewsIds.has(item.id) ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                                      title={expandedNewsIds.has(item.id) ? "Collapse" : "Expand"}
                                    >
                                      {expandedNewsIds.has(item.id) ? <ChevronDown size={16} /> : <Maximize2 size={14} />}
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
                                  {item.raw_text}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
            ) : viewMode === 'reports' ? (
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                {/* Data Selection Engine - Left Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Top Selection Controls */}
                  <div className="border-b border-gray-100 bg-gray-50/50">
                    <div 
                      onClick={() => setIsReportConfigExpanded(!isReportConfigExpanded)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-100/50 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <Settings2 size={16} className="text-gray-900" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-700">Report Configuration</span>
                      </div>
                      <div className={`transform transition-transform duration-300 ${isReportConfigExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={16} className="text-gray-500" />
                      </div>
                    </div>
                    {isReportConfigExpanded && (
                      <div className="p-4 pt-1 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {/* Timeframe Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 px-1">
                        <Calendar size={14} className="text-gray-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Report Timeframe</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['daily', 'weekly', 'monthly'] as const).map((type) => (
                          <button
                            key={type}
                            onClick={() => setSelectedReportType(type)}
                            disabled={isGeneratingReport}
                            className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all disabled:opacity-50 ${
                              selectedReportType === type 
                                ? 'border-red-600 bg-red-50 shadow-sm scale-[1.02]' 
                                : 'border-gray-100 bg-white hover:border-red-200'
                            }`}
                          >
                            <FileText size={16} className={selectedReportType === type ? 'text-red-700 mb-1' : 'text-red-400 mb-1'} />
                            <span className={`text-[9px] font-bold uppercase tracking-tighter ${selectedReportType === type ? 'text-red-900' : 'text-gray-500'}`}>{type}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Source Data Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 px-1">
                        <Database size={14} className="text-gray-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Source Intelligence Layer</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'raw', label: 'Raw News' },
                          { id: 'refined', label: 'Refined' },
                          { id: 'master', label: 'Master' }
                        ].map((source) => (
                          <button
                            key={source.id}
                            onClick={() => setReportSource(source.id as any)}
                            disabled={isGeneratingReport}
                            className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all disabled:opacity-50 ${
                              reportSource === source.id 
                                ? 'border-red-600 bg-red-50 shadow-sm scale-[1.02]' 
                                : 'border-gray-100 bg-white hover:border-red-200'
                            }`}
                          >
                            <div className={`text-[9px] font-bold uppercase tracking-tighter ${reportSource === source.id ? 'text-red-900' : 'text-gray-500'}`}>
                              {source.label}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

                  {/* News Selection List */}
                  <div className={`flex flex-col bg-white ${isReportSelectionExpanded ? 'flex-1 overflow-hidden' : 'border-b border-gray-100'}`}>
                    <div 
                      onClick={() => setIsReportSelectionExpanded(!isReportSelectionExpanded)}
                      className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <History size={16} className="text-gray-900" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-700">Select Items for Report</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <button 
                          onClick={(e) => { e.stopPropagation(); selectAllNews(); }}
                          className="text-[10px] font-bold text-red-700 hover:text-red-900 uppercase tracking-wider"
                        >
                          Select All
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); clearAllNews(); }}
                          className="text-[10px] font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider"
                        >
                          Clear All
                        </button>
                        <div className={`transform transition-transform duration-300 ${isReportSelectionExpanded ? 'rotate-180' : ''}`}>
                          <ChevronDown size={16} className="text-gray-500" />
                        </div>
                      </div>
                    </div>

                    {isReportSelectionExpanded && (
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    {isFetchingNewsForReport ? (
                      <div className="flex justify-center py-12">
                        <Loader2 size={24} className="animate-spin text-gray-400" />
                      </div>
                    ) : newsForReport.filter(item => {
                        if (reportSource === 'raw') return item.type === 'raw';
                        if (reportSource === 'refined') return item.type === 'refined';
                        return true; // Master shows all for selection
                      }).length === 0 ? (
                      <div className="text-center py-12 text-gray-500 italic text-sm font-medium">
                        No {reportSource} news found for {activeCategory} in the {selectedReportType} period.
                      </div>
                    ) : (
                      newsForReport
                        .filter(item => {
                          if (reportSource === 'raw') return item.type === 'raw';
                          if (reportSource === 'refined') return item.type === 'refined';
                          return true;
                        })
                        .map((item) => (
                        <div
                          key={item.id}
                          onClick={() => toggleNewsSelection(item.id)}
                          className={`group relative w-full p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start space-x-4 ${
                            selectedNewsIds.has(item.id)
                              ? 'border-red-500 bg-red-50 shadow-sm'
                              : 'border-gray-100 hover:border-gray-300 bg-white'
                          } ${expandedNewsIds.has(item.id) ? 'h-64' : 'h-auto'}`}
                        >
                          <div className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all ${
                            selectedNewsIds.has(item.id)
                              ? 'bg-red-600 border-red-600 text-white'
                              : 'border-gray-300 bg-white'
                          }`}>
                            {selectedNewsIds.has(item.id) && <Check size={14} strokeWidth={4} />}
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col h-full">
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-[10px] font-mono text-gray-500 font-bold">
                                  {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className={`text-[8px] px-1 rounded font-bold uppercase ${item.type === 'refined' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
                                  {item.type}
                                </span>
                              </div>
                              <button
                                onClick={(e) => toggleExpandNews(item.id, e)}
                                className={`p-1 rounded-md transition-colors ${expandedNewsIds.has(item.id) ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                                title={expandedNewsIds.has(item.id) ? "Collapse" : "Expand"}
                              >
                                {expandedNewsIds.has(item.id) ? <ChevronDown size={16} /> : <Maximize2 size={14} />}
                              </button>
                            </div>
                            <div className={`text-sm text-gray-900 leading-relaxed font-medium overflow-y-auto custom-scrollbar ${expandedNewsIds.has(item.id) ? 'flex-1 pr-2' : 'line-clamp-2 overflow-hidden'}`}>
                              {reportSource === 'raw' ? item.raw_text : (item.summary_en || item.raw_text)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
              <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                <div className="p-6 border-b border-gray-300 bg-white">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900">Trash Bin</h3>
                  <p className="text-xs text-gray-500 mt-1">Items here will be permanently deleted if you choose.</p>
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
                                <span className="text-[10px] text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-xs text-gray-900 truncate">{item.raw_text}</p>
                            </div>
                            <div className="flex items-center space-x-1">
                              <button 
                                onClick={() => handleRestore(item.id, 'news')}
                                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-all"
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
                                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-all"
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
            className={`group relative flex w-1.5 cursor-col-resize items-center justify-center bg-gray-300 transition-colors hover:bg-green-500 ${isResizing ? 'bg-green-600' : ''}`}
          >
            <div className="absolute z-10 flex h-10 w-8 items-center justify-center rounded-lg border-2 border-gray-400 bg-white shadow-lg group-hover:border-green-500 transition-all">
              <GripVertical size={18} className="text-gray-900 group-hover:text-green-600" />
            </div>
          </div>
        )}

        {/* Right Panel: Refined Intelligence */}
        <div 
          className={`flex flex-col bg-panel-right transition-all duration-300 ease-in-out ${maximizedPanel === 'left' ? 'hidden' : 'flex-1'}`}
        >
          {/* Toolbar */}
          <header className="flex h-14 items-center justify-between border-b border-gray-300 px-6 shadow-md bg-green-900 text-white transition-colors duration-300">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => toggleMaximize('right')}
                className={`p-1.5 rounded-lg transition-colors ${
                  maximizedPanel === 'right' 
                    ? 'bg-white/20 text-white' 
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Maximize2 size={18} />
              </button>
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">
                {viewMode === 'intelligence' ? 'Refined Analysis' : 'Market Report Detail'}
              </h2>
            </div>
          </header>
          
          {/* Content: Output Area with Plus Pattern */}
          <div className="flex-1 flex flex-col overflow-y-auto bg-plus-pattern">
            {viewMode === 'reports' ? (
              <div className="flex-1 flex flex-col">
                {/* Report Generation Instructions (Moved to Right) */}
                <div className="bg-white border-b border-gray-300 shadow-sm transition-all duration-300">
                  <div 
                    onClick={() => setIsReportInstructionsExpanded(!isReportInstructionsExpanded)}
                    className="px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-red-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded-lg ${isReportInstructionsExpanded ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        <Settings size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-900">Generate Closing Summary</h3>
                        {!isReportInstructionsExpanded && (
                          <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                            {selectedReportType.toUpperCase()} • {reportOptions.language === 'both' ? 'En & Hi' : reportOptions.language.toUpperCase()} • {reportOptions.format === 'bullet' ? 'Bullets' : 'Paragraph'} • {selectedNewsIds.size} items
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {!isReportInstructionsExpanded && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateReport(selectedReportType);
                          }}
                          disabled={isGeneratingReport || selectedNewsIds.size === 0}
                          className="flex items-center space-x-2 bg-red-700 text-white px-4 py-1.5 rounded-full text-[10px] font-bold hover:bg-red-800 transition-all shadow-md disabled:opacity-50"
                        >
                          {isGeneratingReport ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          <span>{isGeneratingReport ? 'Generating...' : 'Quick Generate'}</span>
                        </button>
                      )}
                      <div className={`transform transition-transform duration-300 ${isReportInstructionsExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={18} className="text-gray-400" />
                      </div>
                    </div>
                  </div>

                  {isReportInstructionsExpanded && (
                    <div className="px-6 pb-6 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                        {/* Column 1: Language & Order */}
                        <div className="flex flex-col space-y-3">
                          <div className="px-1 h-4 flex items-center">
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-gray-400">Language & Order</span>
                          </div>
                          <div className="bg-red-100/50 p-4 rounded-xl border border-red-200 flex-1 space-y-4 shadow-sm">
                            <label className="flex items-center justify-between cursor-pointer group">
                              <div className="flex items-center space-x-3">
                                <div className="relative flex items-center">
                                  <input 
                                    type="checkbox" 
                                    checked={reportOptions.withHeadline}
                                    onChange={(e) => setReportOptions({...reportOptions, withHeadline: e.target.checked})}
                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-gray-300 checked:bg-red-700 checked:border-red-700 transition-all"
                                  />
                                  <Check size={14} className="absolute left-0.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                </div>
                                <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900">With Headline</span>
                              </div>
                              {reportOptions.withHeadline && promptTemplates['headline_format'] && (
                                <button 
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingPrompt(promptTemplates['headline_format']); }} 
                                  className="p-1 items-center justify-center text-gray-400 hover:text-red-600 hover:bg-gray-200 rounded transition-colors"
                                  title="Edit Headline Prompt"
                                >
                                  <Settings2 size={12} />
                                </button>
                              )}
                            </label>
                            
                            <div className="space-y-2">
                              <div className="relative">
                                <select 
                                  value={reportOptions.language}
                                  onChange={(e) => setReportOptions({...reportOptions, language: e.target.value as any})}
                                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium appearance-none"
                                >
                                  <option value="en">English Only</option>
                                  <option value="hi">Hindi Only</option>
                                  <option value="both">English & Hindi Both</option>
                                </select>
                                <div className="absolute right-2 top-1.5 flex space-x-1">
                                  {promptTemplates[`lang_${reportOptions.language}`] && (
                                    <button 
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingPrompt(promptTemplates[`lang_${reportOptions.language}`]); }} 
                                      className="p-1 items-center justify-center text-gray-400 hover:text-red-600 rounded transition-colors"
                                      title="Edit Language Prompt"
                                    >
                                      <Settings2 size={12} />
                                    </button>
                                  )}
                                  <div className="flex items-center text-gray-400 pointer-events-none">
                                    <ChevronDown size={14} />
                                  </div>
                                </div>
                              </div>

                              {reportOptions.language === 'both' && (
                                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                  <select 
                                    value={reportOptions.order}
                                    onChange={(e) => setReportOptions({...reportOptions, order: e.target.value as any})}
                                    className="w-full text-xs bg-white border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium"
                                  >
                                    <option value="en-hi">English → Hindi</option>
                                    <option value="hi-en">Hindi → English</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Format & Length */}
                        <div className="flex flex-col space-y-3">
                          <div className="px-1 h-4 flex items-center">
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-gray-400">Format & Length</span>
                          </div>
                          <div className="bg-red-100/50 p-4 rounded-xl border border-red-200 flex-1 space-y-4 shadow-sm">
                            <div className="flex p-1 bg-gray-200/50 rounded-lg">
                              <button 
                                onClick={() => setReportOptions({...reportOptions, format: 'paragraph'})}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center space-x-1 ${reportOptions.format === 'paragraph' ? 'bg-red-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                <span>Paragraph</span>
                                {reportOptions.format === 'paragraph' && promptTemplates['format_paragraph'] && <Settings2 size={10} className="opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setEditingPrompt(promptTemplates['format_paragraph']); }} />}
                              </button>
                              <button 
                                onClick={() => setReportOptions({...reportOptions, format: 'bullet'})}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center space-x-1 ${reportOptions.format === 'bullet' ? 'bg-red-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                <span>Bullets</span>
                                {reportOptions.format === 'bullet' && promptTemplates['format_bullets'] && <Settings2 size={10} className="opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setEditingPrompt(promptTemplates['format_bullets']); }} />}
                              </button>
                            </div>

                            <div className="space-y-2">
                              <div className="relative">
                                <select 
                                  value={reportOptions.length}
                                  onChange={(e) => setReportOptions({...reportOptions, length: e.target.value as any})}
                                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium appearance-none"
                                >
                                  <option value="short">Very Short Summary</option>
                                  <option value="medium">Medium Short Summary</option>
                                  <option value="normal">Normal Summary</option>
                                </select>
                                <div className="absolute right-2 top-1.5 flex space-x-1">
                                  {promptTemplates[`length_${reportOptions.length}`] && (
                                    <button 
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingPrompt(promptTemplates[`length_${reportOptions.length}`]); }} 
                                      className="p-1 items-center justify-center text-gray-400 hover:text-red-600 rounded transition-colors"
                                      title="Edit Length Prompt"
                                    >
                                      <Settings2 size={12} />
                                    </button>
                                  )}
                                  <div className="flex items-center text-gray-400 pointer-events-none">
                                    <ChevronDown size={14} />
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-2.5 group focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 transition-all">
                                <span className="text-[10px] font-bold text-gray-400 mr-2 uppercase tracking-tight">Line Limit:</span>
                                <input 
                                  type="number" 
                                  value={reportOptions.lineLimit}
                                  onChange={(e) => setReportOptions({...reportOptions, lineLimit: e.target.value})}
                                  className="w-full text-xs font-bold bg-transparent focus:outline-none text-gray-700"
                                  placeholder="None"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Column 3: Intelligence Add-ons */}
                        <div className="flex flex-col space-y-3">
                          <div className="px-1 h-4 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-gray-400">Intelligence Add-ons</span>
                            <button 
                              onClick={() => setIsAddingAddOn(true)}
                              className="text-[10px] font-bold text-red-800 hover:text-red-900 flex items-center space-x-0.5 transition-colors"
                            >
                              <Plus size={10} />
                              <span>Add</span>
                            </button>
                          </div>
                          <div className="bg-red-100/50 p-4 rounded-xl border border-red-200 flex-1 space-y-4 shadow-sm overflow-y-auto">
                            <div className="grid grid-cols-2 gap-y-4 gap-x-3">
                              {[
                                { key: 'includeSentiment', label: 'Sentiment', promptKey: 'addon_sentiment' },
                                { key: 'extractFigures', label: 'Figures', promptKey: 'addon_figures' },
                                { key: 'addImpact', label: 'Impact', promptKey: 'addon_impact' },
                                { key: 'generateTags', label: 'Tags', promptKey: 'addon_tags' },
                              ].map((opt) => (
                                <div key={opt.key} className="flex items-center group relative w-full h-[24px]">
                                  <label className="flex items-center space-x-3 cursor-pointer w-[66%]">
                                    <div className="relative flex items-center">
                                      <input 
                                        type="checkbox" 
                                        checked={(reportOptions as any)[opt.key]}
                                        onChange={(e) => setReportOptions({...reportOptions, [opt.key]: e.target.checked})}
                                        className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-gray-300 checked:bg-red-700 checked:border-red-700 transition-all"
                                      />
                                      <Check size={14} className="absolute left-0.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-600 transition-colors w-[150%]">{opt.label}</span>
                                  </label>
                                  {(reportOptions as any)[opt.key] && promptTemplates[opt.promptKey] && (
                                    <div className="absolute right-0 opacity-100 p-0 hover:bg-gray-200 cursor-pointer rounded transition-opacity" onClick={() => setEditingPrompt(promptTemplates[opt.promptKey])}>
                                      <Settings2 size={12} className="text-gray-400 p-0 m-0"/>
                                    </div>
                                  )}
                                </div>
                              ))}
                              {customAddOns.map((addon) => (
                                <label key={addon.id} className="flex items-center space-x-3 cursor-pointer group">
                                  <div className="relative flex items-center">
                                    <input 
                                      type="checkbox" 
                                      checked={addon.enabled}
                                      onChange={(e) => {
                                        setCustomAddOns(customAddOns.map(a => a.id === addon.id ? {...a, enabled: e.target.checked} : a));
                                      }}
                                      className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-gray-300 checked:bg-red-700 checked:border-red-700 transition-all"
                                    />
                                    <Check size={14} className="absolute left-0.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                  </div>
                                  <span className="text-[11px] font-bold text-gray-600 group-hover:text-gray-900 transition-colors truncate max-w-[70px]" title={addon.label}>{addon.label}</span>
                                </label>
                              ))}
                            </div>

                            <div className="pt-2 border-t border-red-200/50 space-y-2">
                              <div className="flex items-center space-x-2">
                                <MessageSquare size={12} className="text-red-700" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Custom Focus</span>
                              </div>
                              <textarea 
                                value={reportInstructions}
                                onChange={(e) => setReportInstructions(e.target.value)}
                                placeholder="Example: Focus on price volatility, highlight impact on Indian markets..."
                                className="w-full h-20 p-3 rounded-lg border border-red-200 bg-white/50 focus:bg-white focus:border-red-500 focus:ring-0 text-xs placeholder:text-gray-400 transition-all resize-none custom-scrollbar"
                              />
                            </div>

                            {isAddingAddOn && (
                              <div className="pt-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                <div className="flex items-center space-x-2">
                                  <input 
                                    autoFocus
                                    type="text" 
                                    value={newAddOnLabel}
                                    onChange={(e) => setNewAddOnLabel(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && newAddOnLabel.trim()) {
                                        setCustomAddOns([...customAddOns, { id: Date.now().toString(), label: newAddOnLabel.trim(), enabled: true }]);
                                        setNewAddOnLabel('');
                                        setIsAddingAddOn(false);
                                      } else if (e.key === 'Escape') {
                                        setIsAddingAddOn(false);
                                        setNewAddOnLabel('');
                                      }
                                    }}
                                    placeholder="Add instruction..."
                                    className="flex-1 text-[10px] font-bold bg-white border border-red-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                                  />
                                  <button 
                                    onClick={() => {
                                      if (newAddOnLabel.trim()) {
                                        setCustomAddOns([...customAddOns, { id: Date.now().toString(), label: newAddOnLabel.trim(), enabled: true }]);
                                        setNewAddOnLabel('');
                                        setIsAddingAddOn(false);
                                      }
                                    }}
                                    className="text-red-700 hover:text-red-800"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col space-y-4 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between pt-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Current Configuration</span>
                            <span className="text-xs font-bold text-gray-900 uppercase">
                              {selectedReportType} • {reportSource} Mode
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              handleGenerateReport(selectedReportType);
                            }}
                            disabled={isGeneratingReport || selectedNewsIds.size === 0}
                            className="flex items-center space-x-3 bg-red-700 text-white px-8 py-3 rounded-full text-sm font-bold hover:bg-red-800 transition-all shadow-lg shadow-red-100 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95"
                          >
                            {isGeneratingReport ? (
                              <>
                                <Loader2 size={18} className="animate-spin" />
                                <span>Synthesizing...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles size={18} />
                                <span>Generate {selectedReportType.toUpperCase()} Report</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Report Content Display */}
                <div className={`transition-all duration-300 ${isReportPreviewExpanded ? 'flex-1' : ''}`}>
                  <div 
                    onClick={() => setIsReportPreviewExpanded(!isReportPreviewExpanded)}
                    className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-50 transition-colors bg-white/50 border-b border-gray-200"
                  >
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-700">Preview & Content</span>
                    <div className="flex items-center space-x-4">
                      {isReportPreviewExpanded && (
                        <>
                          <div className="flex items-center bg-gray-100/50 p-1 rounded-lg border border-gray-200 shadow-sm" onClick={(e) => e.stopPropagation()}>
                            <button 
                              onClick={() => setPreviewMode('whatsapp')}
                              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                previewMode === 'whatsapp' ? 'bg-red-700 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              WhatsApp
                            </button>
                            <button 
                              onClick={() => setPreviewMode('desktop')}
                              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                previewMode === 'desktop' ? 'bg-red-700 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              Desktop
                            </button>
                          </div>
                          
                          <div className="flex items-center space-x-2 bg-white rounded-full px-3 py-1 shadow-sm border border-gray-200" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={() => setReportZoom(Math.max(0.5, reportZoom - 0.1))}
                                className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                <ZoomOut size={14} />
                              </button>
                              <span className="text-[10px] font-bold text-gray-400 w-8 text-center">{Math.round(reportZoom * 100)}%</span>
                              <button 
                                onClick={() => setReportZoom(Math.min(2, reportZoom + 0.1))}
                                className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                <ZoomIn size={14} />
                              </button>
                            </div>
                        </>
                      )}
                      <div className={`transform transition-transform duration-300 ${isReportPreviewExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={18} className="text-gray-400" />
                      </div>
                    </div>
                  </div>
                  {isReportPreviewExpanded && (
                    <div className="flex-1 p-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  {(selectedReport || isGeneratingReport) ? (
                    previewMode === 'whatsapp' ? (
                      <div 
                        className="flex justify-center transition-all duration-300 relative my-8"
                        style={{ height: `${640 * reportZoom}px` }}
                      >
                        {/* Mobile Frame */}
                        <div 
                          className="relative w-[320px] h-[640px] bg-black rounded-[3rem] border-[8px] border-gray-800 shadow-2xl overflow-hidden flex-shrink-0 flex flex-col transition-transform duration-300 origin-top"
                          style={{ transform: `scale(${reportZoom})` }}
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
                          <div className="flex-1 overflow-y-auto bg-[#E5DDD5] relative p-3 space-y-2 custom-scrollbar">
                            <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"></div>
                            <div className="flex flex-col space-y-2 relative z-10">
                              <div className="flex justify-center my-2">
                                <span className="bg-[#D1E4F0] text-[10px] font-bold text-gray-600 px-3 py-1 rounded-lg uppercase shadow-sm">Today</span>
                              </div>
                              <div className="max-w-[92%] self-start bg-white rounded-lg rounded-tl-none shadow-sm p-3 relative">
                                <div className="absolute top-0 -left-2 w-2 h-3 bg-white" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}></div>
                                
                                {isGeneratingReport ? (
                                  <div className="flex flex-col items-center justify-center py-8 space-y-4">
                                    <div className="relative">
                                      <Loader2 size={32} className="animate-spin text-red-600" />
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <Sparkles size={12} className="text-red-800 animate-pulse" />
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-center">
                                      <span className="text-[11px] font-bold text-gray-600 animate-pulse">Synthesizing Report...</span>
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
                                    <button 
                                      onClick={() => handleCopy('report', selectedReport.id, selectedReport.content_en + '\n\n' + selectedReport.content_hi)}
                                      className={`absolute top-1 right-1 p-1.5 rounded-md transition-all z-20 ${
                                        selectedReport.is_copied 
                                          ? 'bg-green-100 text-green-600' 
                                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                      }`}
                                      title={selectedReport.is_copied ? "Already copied" : "Copy to WhatsApp"}
                                    >
                                      {selectedReport.is_copied ? <Check size={14} /> : <Copy size={14} />}
                                    </button>

                                    <div className="text-[13px] leading-relaxed text-gray-800">
                                      <div className={`${!isWhatsAppExpanded ? 'line-clamp-[15]' : ''} transition-all duration-300`}>
                                        <Markdown>{selectedReport.content_en + '\n\n' + selectedReport.content_hi}</Markdown>
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
                        className="max-w-3xl mx-auto bg-white p-10 rounded-3xl shadow-2xl border border-gray-100 relative overflow-hidden origin-top transition-transform"
                        style={{ zoom: reportZoom }}
                      >
                        <div className="absolute top-0 left-0 w-full h-2 bg-red-600"></div>
                        
                        {isGeneratingReport ? (
                          <div className="flex flex-col items-center justify-center py-24 space-y-6">
                            <div className="relative">
                              <Loader2 size={48} className="animate-spin text-red-600" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles size={18} className="text-red-800 animate-pulse" />
                              </div>
                            </div>
                            <div className="text-center space-y-2">
                              <h3 className="text-lg font-bold text-gray-900 tracking-tight uppercase">Synthesizing Market Report...</h3>
                              <p className="text-sm text-gray-500 italic font-medium">Gemini is aggregating selected intelligence and drafting analysis.</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-center mb-8">
                              <div className="flex items-center space-x-3">
                                <div className="bg-red-100 p-2 rounded-lg">
                                  <FileText className="text-red-700" size={24} />
                                </div>
                                <div>
                                  <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
                                    {selectedReport.category}
                                  </h1>
                                  <p className="text-xs font-bold text-red-600 uppercase tracking-[0.2em]">
                                    {selectedReport.type} Closing Report
                                  </p>
                                  {selectedReport.source_mode && (
                                    <div className="flex items-center space-x-2 mt-1">
                                      <span className="text-[9px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter border border-red-100">
                                        Mode: {selectedReport.source_mode}
                                      </span>
                                      {selectedReport.source_news_ids && (
                                        <span className="text-[9px] text-gray-400 font-bold">
                                          • {JSON.parse(selectedReport.source_news_ids).length} Items Traceable
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-mono text-gray-400 font-bold">
                                  {new Date(selectedReport.created_at).toLocaleDateString(undefined, { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                  })}
                                </p>
                              </div>
                            </div>

                            <div className="prose prose-sm max-w-none">
                              <div className="mb-10">
                                <div className="flex items-center space-x-2 mb-4">
                                  <span className="h-px w-8 bg-gray-300"></span>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">English Analysis</span>
                                  <span className="h-px flex-1 bg-gray-300"></span>
                                </div>
                                <div className="text-gray-800 leading-relaxed text-base font-medium">
                                  <Markdown>{selectedReport.content_en}</Markdown>
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center space-x-2 mb-4">
                                  <span className="h-px w-8 bg-red-300"></span>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Hindi Summary</span>
                                  <span className="h-px flex-1 bg-red-300"></span>
                                </div>
                                <div className="text-gray-900 leading-relaxed text-lg font-bold bg-red-50/30 p-6 rounded-2xl border border-red-100/50">
                                  <Markdown>{selectedReport.content_hi}</Markdown>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                        <Sparkles size={48} className="text-red-200" />
                      </div>
                      <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Ready for Generation</h3>
                      <p className="text-gray-500 mt-2 max-w-xs font-medium">
                        Select news items on the left and configure your report settings above to begin.
                      </p>
                    </div>
                  )}
                  </div>
                )}
              </div>
            </div>
            ) : selectedNews ? (
              <div className="flex-1 flex flex-col">
                {/* Collapsible Refinement Instructions */}
                <div className="bg-white border-b border-gray-300 shadow-sm transition-all duration-300">
                  <div 
                    onClick={() => setIsIntelligenceInstructionsExpanded(!isIntelligenceInstructionsExpanded)}
                    className="px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded-lg ${isIntelligenceInstructionsExpanded ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        <Settings size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-900">Refinement Instructions</h3>
                        {!isIntelligenceInstructionsExpanded && (
                          <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                            {refineOptions.language === 'both' ? 'En & Hi' : refineOptions.language.toUpperCase()} • 
                            {refineOptions.format === 'bullet' ? ' Bullets' : ' Paragraph'} • 
                            {refineOptions.length}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {!isIntelligenceInstructionsExpanded && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefine(selectedNews);
                          }}
                          disabled={isRefining}
                          className="flex items-center space-x-2 bg-green-800 text-white px-4 py-1.5 rounded-full text-[10px] font-bold hover:bg-green-900 transition-all shadow-md disabled:opacity-50"
                        >
                          {isRefining ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          <span>{isRefining ? 'Refining...' : 'Quick Refine'}</span>
                        </button>
                      )}
                      <div className={`transform transition-transform duration-300 ${isIntelligenceInstructionsExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={18} className="text-gray-400" />
                      </div>
                    </div>
                  </div>

                  {isIntelligenceInstructionsExpanded && (
                    <div className="px-6 pb-6 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                        {/* Column 1: Language & Order */}
                        <div className="flex flex-col space-y-3">
                          <div className="px-1 h-4 flex items-center">
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-gray-400">Language & Order</span>
                          </div>
                          <div className="bg-green-100/50 p-4 rounded-xl border border-green-200 flex-1 space-y-4 shadow-sm">
                            <label className="flex items-center justify-between cursor-pointer group">
                              <div className="flex items-center space-x-3">
                                <div className="relative flex items-center">
                                  <input 
                                    type="checkbox" 
                                    checked={refineOptions.withHeadline}
                                    onChange={(e) => setRefineOptions({...refineOptions, withHeadline: e.target.checked})}
                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-gray-300 checked:bg-green-700 checked:border-green-700 transition-all"
                                  />
                                  <Check size={14} className="absolute left-0.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                </div>
                                <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900">With Headline</span>
                              </div>
                              {refineOptions.withHeadline && promptTemplates['headline_format'] && (
                                <button 
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingPrompt(promptTemplates['headline_format']); }} 
                                  className="p-1 items-center justify-center text-gray-400 hover:text-green-600 hover:bg-gray-200 rounded transition-colors"
                                  title="Edit Headline Prompt"
                                >
                                  <Settings2 size={12} />
                                </button>
                              )}
                            </label>
                            
                            <div className="space-y-2">
                              <div className="relative">
                                <select 
                                  value={refineOptions.language}
                                  onChange={(e) => setRefineOptions({...refineOptions, language: e.target.value as any})}
                                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium appearance-none"
                                >
                                  <option value="en">English Only</option>
                                  <option value="hi">Hindi Only</option>
                                  <option value="both">English & Hindi Both</option>
                                </select>
                                <div className="absolute right-2 top-1.5 flex space-x-1">
                                  {promptTemplates[`lang_${refineOptions.language}`] && (
                                    <button 
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingPrompt(promptTemplates[`lang_${refineOptions.language}`]); }} 
                                      className="p-1 items-center justify-center text-gray-400 hover:text-green-600 rounded transition-colors"
                                      title="Edit Language Prompt"
                                    >
                                      <Settings2 size={12} />
                                    </button>
                                  )}
                                  <div className="flex items-center text-gray-400 pointer-events-none">
                                    <ChevronDown size={14} />
                                  </div>
                                </div>
                              </div>

                              {refineOptions.language === 'both' && (
                                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                  <select 
                                    value={refineOptions.order}
                                    onChange={(e) => setRefineOptions({...refineOptions, order: e.target.value as any})}
                                    className="w-full text-xs bg-white border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                  >
                                    <option value="en-hi">English → Hindi</option>
                                    <option value="hi-en">Hindi → English</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Format & Length */}
                        <div className="flex flex-col space-y-3">
                          <div className="px-1 h-4 flex items-center">
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-gray-400">Format & Length</span>
                          </div>
                          <div className="bg-green-100/50 p-4 rounded-xl border border-green-200 flex-1 space-y-4 shadow-sm">
                            <div className="flex p-1 bg-gray-200/50 rounded-lg items-center">
                              <button 
                                onClick={() => setRefineOptions({...refineOptions, format: 'paragraph'})}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center space-x-1 ${refineOptions.format === 'paragraph' ? 'bg-green-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                <span>Paragraph</span>
                                {refineOptions.format === 'paragraph' && promptTemplates['format_paragraph'] && <Settings2 size={10} className="opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setEditingPrompt(promptTemplates['format_paragraph']); }} />}
                              </button>
                              <button 
                                onClick={() => setRefineOptions({...refineOptions, format: 'bullet'})}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center space-x-1 ${refineOptions.format === 'bullet' ? 'bg-green-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                <span>Bullets</span>
                                {refineOptions.format === 'bullet' && promptTemplates['format_bullets'] && <Settings2 size={10} className="opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setEditingPrompt(promptTemplates['format_bullets']); }} />}
                              </button>
                            </div>

                            <div className="space-y-2">
                              <div className="relative">
                                <select 
                                  value={refineOptions.length}
                                  onChange={(e) => setRefineOptions({...refineOptions, length: e.target.value as any})}
                                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium appearance-none"
                                >
                                  <option value="short">Very Short Summary</option>
                                  <option value="medium">Medium Short Summary</option>
                                  <option value="normal">Normal Summary</option>
                                </select>
                                <div className="absolute right-2 top-1.5 flex space-x-1">
                                  {promptTemplates[`length_${refineOptions.length}`] && (
                                    <button 
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingPrompt(promptTemplates[`length_${refineOptions.length}`]); }} 
                                      className="p-1 items-center justify-center text-gray-400 hover:text-green-600 rounded transition-colors"
                                      title="Edit Length Prompt"
                                    >
                                      <Settings2 size={12} />
                                    </button>
                                  )}
                                  <div className="flex items-center text-gray-400 pointer-events-none">
                                    <ChevronDown size={14} />
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-2.5 group focus-within:ring-2 focus-within:ring-green-500/20 focus-within:border-green-500 transition-all">
                                <span className="text-[10px] font-bold text-gray-400 mr-2 uppercase tracking-tight">Line Limit:</span>
                                <input 
                                  type="number" 
                                  value={refineOptions.lineLimit}
                                  onChange={(e) => setRefineOptions({...refineOptions, lineLimit: e.target.value})}
                                  className="w-full text-xs font-bold bg-transparent focus:outline-none text-gray-700"
                                  placeholder="None"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Column 3: Intelligence Add-ons */}
                        <div className="flex flex-col space-y-3">
                          <div className="px-1 h-4 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-gray-400">Intelligence Add-ons</span>
                            <button 
                              onClick={() => setIsAddingAddOn(true)}
                              className="text-[10px] font-bold text-green-800 hover:text-green-900 flex items-center space-x-0.5 transition-colors"
                            >
                              <Plus size={10} />
                              <span>Add</span>
                            </button>
                          </div>
                          <div className="bg-green-100/50 p-4 rounded-xl border border-green-200 flex-1 space-y-4 shadow-sm overflow-y-auto">
                            <div className="grid grid-cols-2 gap-y-4 gap-x-3">
                              {[
                                { key: 'includeSentiment', label: 'Sentiment', promptKey: 'addon_sentiment' },
                                { key: 'extractFigures', label: 'Figures', promptKey: 'addon_figures' },
                                { key: 'addImpact', label: 'Impact', promptKey: 'addon_impact' },
                                { key: 'generateTags', label: 'Tags', promptKey: 'addon_tags' },
                              ].map((opt) => (
                                <div key={opt.key} className="flex items-center group relative w-full h-[24px]">
                                  <label className="flex items-center space-x-3 cursor-pointer w-[66%]">
                                    <div className="relative flex items-center">
                                      <input 
                                        type="checkbox" 
                                        checked={(refineOptions as any)[opt.key]}
                                        onChange={(e) => setRefineOptions({...refineOptions, [opt.key]: e.target.checked})}
                                        className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-gray-300 checked:bg-green-700 checked:border-green-700 transition-all"
                                      />
                                      <Check size={14} className="absolute left-0.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-600 transition-colors w-[150%]">{opt.label}</span>
                                  </label>
                                  {(refineOptions as any)[opt.key] && promptTemplates[opt.promptKey] && (
                                    <div className="absolute right-0 opacity-100 p-0 hover:bg-gray-200 cursor-pointer rounded transition-opacity" onClick={() => setEditingPrompt(promptTemplates[opt.promptKey])}>
                                      <Settings2 size={12} className="text-gray-400 p-0 m-0"/>
                                    </div>
                                  )}
                                </div>
                              ))}
                              {customAddOns.map((addon) => (
                                <label key={addon.id} className="flex items-center space-x-3 cursor-pointer group">
                                  <div className="relative flex items-center">
                                    <input 
                                      type="checkbox" 
                                      checked={addon.enabled}
                                      onChange={(e) => {
                                        setCustomAddOns(customAddOns.map(a => a.id === addon.id ? {...a, enabled: e.target.checked} : a));
                                      }}
                                      className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-gray-300 checked:bg-green-700 checked:border-green-700 transition-all"
                                    />
                                    <Check size={14} className="absolute left-0.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                  </div>
                                  <span className="text-[11px] font-bold text-gray-600 group-hover:text-gray-900 transition-colors truncate max-w-[70px]" title={addon.label}>{addon.label}</span>
                                </label>
                              ))}
                            </div>

                            <div className="pt-2 border-t border-green-200/50 space-y-2">
                              <div className="flex items-center space-x-2">
                                <MessageSquare size={12} className="text-green-800" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Custom Focus</span>
                              </div>
                              <textarea 
                                value={refineInstructions}
                                onChange={(e) => setRefineInstructions(e.target.value)}
                                placeholder="Example: Focus on price volatility, highlight impact on Indian markets..."
                                className="w-full h-20 p-3 rounded-lg border border-green-200 bg-white/50 focus:bg-white focus:border-green-500 focus:ring-0 text-xs placeholder:text-gray-400 transition-all resize-none custom-scrollbar"
                              />
                            </div>
                            
                            {isAddingAddOn && (
                              <div className="pt-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                <div className="flex items-center space-x-2">
                                  <input 
                                    autoFocus
                                    type="text" 
                                    value={newAddOnLabel}
                                    onChange={(e) => setNewAddOnLabel(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && newAddOnLabel.trim()) {
                                        setCustomAddOns([...customAddOns, { id: Date.now().toString(), label: newAddOnLabel.trim(), enabled: true }]);
                                        setNewAddOnLabel('');
                                        setIsAddingAddOn(false);
                                      } else if (e.key === 'Escape') {
                                        setIsAddingAddOn(false);
                                        setNewAddOnLabel('');
                                      }
                                    }}
                                    placeholder="Add instruction..."
                                    className="flex-1 text-[10px] font-bold bg-white border border-green-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                                  />
                                  <button 
                                    onClick={() => {
                                      if (newAddOnLabel.trim()) {
                                        setCustomAddOns([...customAddOns, { id: Date.now().toString(), label: newAddOnLabel.trim(), enabled: true }]);
                                        setNewAddOnLabel('');
                                        setIsAddingAddOn(false);
                                      }
                                    }}
                                    className="text-green-700 hover:text-green-800"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="pt-2">
                        <button 
                          onClick={() => {
                            handleRefine(selectedNews);
                          }}
                          disabled={isRefining}
                          className="w-full flex items-center justify-center space-x-3 bg-green-800 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-green-900 transition-all shadow-xl shadow-green-100 disabled:opacity-50"
                        >
                          {isRefining ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />
                              <span>Synthesizing Intelligence...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={18} />
                              <span>Refine with Gemini AI</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* News Content Area */}
                <div className={`transition-all duration-300 ${!isIntelligencePreviewExpanded ? 'border-b border-gray-200' : ''}`}>
                  <div 
                    onClick={() => setIsIntelligencePreviewExpanded(!isIntelligencePreviewExpanded)}
                    className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-50 transition-colors bg-white/50 border-b border-gray-200"
                  >
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-700">Generated Intelligence</span>
                    <div className="flex items-center space-x-4">
                      {isIntelligencePreviewExpanded && (
                        <>
                          <div className="flex items-center bg-gray-100/50 p-1 rounded-lg border border-gray-200 shadow-sm" onClick={(e) => e.stopPropagation()}>
                            <button 
                              onClick={() => setPreviewMode('whatsapp')}
                              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                previewMode === 'whatsapp' ? 'bg-green-800 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              WhatsApp
                            </button>
                            <button 
                              onClick={() => setPreviewMode('desktop')}
                              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                previewMode === 'desktop' ? 'bg-green-800 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              Desktop
                            </button>
                          </div>
                          
                          <div className="flex items-center space-x-2 bg-white rounded-full px-3 py-1 shadow-sm border border-gray-200" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={() => setNewsZoom(Math.max(0.5, newsZoom - 0.1))}
                                className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                <ZoomOut size={14} />
                              </button>
                              <span className="text-[10px] font-bold text-gray-400 w-8 text-center">{Math.round(newsZoom * 100)}%</span>
                              <button 
                                onClick={() => setNewsZoom(Math.min(2, newsZoom + 0.1))}
                                className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                <ZoomIn size={14} />
                              </button>
                            </div>
                        </>
                      )}
                      <div className={`transform transition-transform duration-300 ${isIntelligencePreviewExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={18} className="text-gray-400" />
                      </div>
                    </div>
                  </div>
                  {isIntelligencePreviewExpanded && (
                    <div className="p-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="max-w-2xl mx-auto">
                    {(selectedNews.summary_en || isRefining) ? (
                      previewMode === 'whatsapp' ? (
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
                            <div className="flex-1 overflow-y-auto bg-[#E5DDD5] relative p-3 space-y-2 custom-scrollbar">
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
                                      <button 
                                        onClick={() => {
                                          const en = selectedNews.summary_en || '';
                                          const hi = selectedNews.summary_hi || '';
                                          const textToCopy = refineOptions.order === 'hi-en' 
                                            ? `${hi}${hi && en ? '\n\n' : ''}${en}`
                                            : `${en}${en && hi ? '\n\n' : ''}${hi}`;
                                          handleCopy('news', selectedNews.id, textToCopy.trim());
                                        }}
                                        className={`absolute top-1 right-1 p-1.5 rounded-md transition-all z-20 ${
                                          selectedNews.is_copied 
                                            ? 'bg-green-100 text-green-600' 
                                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                        }`}
                                        title={selectedNews.is_copied ? "Already copied" : "Copy to WhatsApp"}
                                      >
                                        {selectedNews.is_copied ? <Check size={14} /> : <Copy size={14} />}
                                      </button>

                                      <div className="text-[13px] leading-relaxed text-gray-800">
                                        <div className={`${!isWhatsAppExpanded ? 'line-clamp-[15]' : ''} transition-all duration-300`}>
                                          <Markdown>
                                            {refineOptions.order === 'hi-en' 
                                              ? `${selectedNews.summary_hi || ''}${(selectedNews.summary_hi && selectedNews.summary_en) ? '\n\n' : ''}${selectedNews.summary_en || ''}`.trim()
                                              : `${selectedNews.summary_en || ''}${(selectedNews.summary_en && selectedNews.summary_hi) ? '\n\n' : ''}${selectedNews.summary_hi || ''}`.trim()
                                            }
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
                                <>
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold uppercase tracking-widest text-red-800">Hindi Translation • हिंदी अनुवाद</span>
                                      <span className="text-xs text-gray-700 font-mono font-bold">ID: #{selectedNews.id}</span>
                                    </div>
                                    <div className="prose prose-sm max-w-none">
                                      {selectedNews.summary_hi ? (
                                        <p className="text-gray-900 font-serif text-xl leading-relaxed whitespace-pre-wrap font-medium">{selectedNews.summary_hi}</p>
                                      ) : (
                                        <p className="text-gray-500 italic font-serif text-xl leading-relaxed font-bold">प्रसंस्करण के बाद यहां अनुवाद दिखाई देगा...</p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="h-px bg-gray-400 w-full" />
                                  
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold uppercase tracking-widest text-green-800">English Summary</span>
                                    </div>
                                    <div className="prose prose-sm max-w-none">
                                      <p className="text-gray-900 font-serif text-xl leading-relaxed whitespace-pre-wrap font-medium">{selectedNews.summary_en}</p>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold uppercase tracking-widest text-green-800">English Summary</span>
                                      <span className="text-xs text-gray-700 font-mono font-bold">ID: #{selectedNews.id}</span>
                                    </div>
                                    <div className="prose prose-sm max-w-none">
                                      <p className="text-gray-900 font-serif text-xl leading-relaxed whitespace-pre-wrap font-medium">{selectedNews.summary_en}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="h-px bg-gray-400 w-full" />
                                  
                                  <div className="space-y-4">
                                    <span className="text-xs font-bold uppercase tracking-widest text-red-800">Hindi Translation • हिंदी अनुवाद</span>
                                    <div className="prose prose-sm max-w-none">
                                      {selectedNews.summary_hi ? (
                                        <p className="text-gray-900 font-serif text-xl leading-relaxed whitespace-pre-wrap font-medium">{selectedNews.summary_hi}</p>
                                      ) : (
                                        <p className="text-gray-500 italic font-serif text-xl leading-relaxed font-bold">प्रसंस्करण के बाद यहां अनुवाद दिखाई देगा...</p>
                                      )}
                                    </div>
                                  </div>
                                </>
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
                )}
                </div>
                
                {/* Original Raw Text Area */}
                <div className={`transition-all duration-300 bg-gray-50 ${!isIntelligenceRawExpanded ? 'border-b border-gray-200' : ''}`}>
                  <div 
                    onClick={() => setIsIntelligenceRawExpanded(!isIntelligenceRawExpanded)}
                    className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-200"
                  >
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-700">Original Raw Text</span>
                    <div className="flex items-center space-x-4">
                      {isIntelligenceRawExpanded && (
                        <div className="flex items-center space-x-2 bg-white rounded-full px-3 py-1 shadow-sm border border-gray-200" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => setRawTextZoom(Math.max(0.5, rawTextZoom - 0.1))}
                            className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                          >
                            <ZoomOut size={14} />
                          </button>
                          <span className="text-[10px] font-bold text-gray-400 w-8 text-center">{Math.round(rawTextZoom * 100)}%</span>
                          <button 
                            onClick={() => setRawTextZoom(Math.min(2, rawTextZoom + 0.1))}
                            className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                          >
                            <ZoomIn size={14} />
                          </button>
                        </div>
                      )}
                      <div className={`transform transition-transform duration-300 ${isIntelligenceRawExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={18} className="text-gray-400" />
                      </div>
                    </div>
                  </div>
                  
                  {isIntelligenceRawExpanded && (
                    <div className="p-8 pb-12 animate-in fade-in slide-in-from-top-2 duration-300 bg-gray-50">
                    <p 
                      className="text-gray-800 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm font-medium transition-all duration-300"
                      style={{ fontSize: `${14 * rawTextZoom}px`, lineHeight: 1.625 }}
                    >
                      {selectedNews.raw_text}
                    </p>
                  </div>
                )}
                </div>
              </div>
            ) : selectedReport ? (
              <div className="max-w-2xl mx-auto space-y-8 p-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-red-800">{selectedReport.type} Market Report (English)</span>
                    <span className="text-xs text-gray-700 font-mono font-bold">Generated: {new Date(selectedReport.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="prose prose-sm max-w-none bg-white p-8 rounded-2xl border-2 border-red-300 shadow-md">
                    <p className="text-gray-900 font-serif text-lg leading-relaxed whitespace-pre-wrap font-medium">{selectedReport.content_en}</p>
                  </div>
                </div>
                
                <div className="h-px bg-gray-400 w-full" />
                
                <div className="space-y-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-red-800">Hindi Translation • हिंदी अनुवाद</span>
                  <div className="prose prose-sm max-w-none bg-white p-8 rounded-2xl border-2 border-red-300 shadow-md">
                    <p className="text-gray-900 font-serif text-lg leading-relaxed whitespace-pre-wrap font-medium">{selectedReport.content_hi}</p>
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
                    {viewMode === 'intelligence' ? 'No News Selected' : 'No Report Selected'}
                  </h3>
                  <p className="text-base text-gray-700 font-medium max-w-xs mx-auto">
                    {viewMode === 'intelligence' 
                      ? 'Select an item from the history feed to view its analysis.' 
                      : 'Select a report from the archive or generate a new one.'}
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
                  <Settings2 size={20} className="text-green-700" />
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
                className="px-6 py-2.5 rounded-xl font-bold bg-green-700 hover:bg-green-800 text-white shadow-md transition-all text-sm flex items-center"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
