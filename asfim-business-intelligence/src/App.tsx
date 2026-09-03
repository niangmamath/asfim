import React, { useState, useMemo, useEffect } from 'react';
import { Search, Download, Layers, Calendar, RefreshCw, Info, ArrowUpDown, X, SlidersHorizontal, Building2, ShieldAlert } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer
} from 'recharts';

// Index léger généré chaque jour par ASFIM_Downloader/sync.py et publié sur
// Vercel Blob : juste generated_at/classifications/dates, jamais le détail par
// société de toutes les dates d'un coup (ça grossirait sans limite — un fichier
// par date est chargé séparément à la demande, voir HISTORY_BASE_URL plus bas).
const HISTORY_JSON_URL =
  import.meta.env.VITE_HISTORY_JSON_URL ||
  "https://REPLACE_WITH_YOUR_BLOB_STORE.public.blob.vercel-storage.com/history.json";

// Base du store Blob, dérivée de HISTORY_JSON_URL, pour construire l'URL du
// fichier d'une date précise : `${HISTORY_BASE_URL}/history/${date}.json`.
const HISTORY_BASE_URL = HISTORY_JSON_URL.replace(/\/[^/]*$/, "");

type HistorySnapshot = {
  date: string;
  type: string;
  companies: any[];
  hierarchy: any[];
};

type HistoryIndex = {
  generated_at: string;
  classifications: string[];
  dates: { date: string; type: string }[];
};

// Détail par fonds individuel (dernière date), généré par ASFIM_Downloader/build_funds.py.
// Vue distincte de l'agrégat par société ci-dessus : n'écrase ni ne modifie l'existant.
const FUNDS_JSON_URL =
  import.meta.env.VITE_FUNDS_JSON_URL ||
  "https://REPLACE_WITH_YOUR_BLOB_STORE.public.blob.vercel-storage.com/funds.json";

type Fund = {
  isin: string | null;
  name: string | null;
  societe: string | null;
  classification: string | null;
  indiceBenchmark: string | null;
  vl: number | null;
  an: number | null;
  perf1j: number | null;
  perf1s: number | null;
  perf1m: number | null;
  perf3m: number | null;
  perf6m: number | null;
  perf1an: number | null;
  perf2ans: number | null;
  perf3ans: number | null;
  perf5ans: number | null;
  commissionSouscription: number | null;
  commissionRachat: number | null;
  fraisGestion: number | null;
  depositaire: string | null;
  sensibilite: string | null;
  periodiciteVL: string | null;
  affectationResultats: string | null;
  reseau: string[];
};

type FundsPayload = {
  generated_at: string;
  date: string;
  count: number;
  funds: Fund[];
};

type FundSortKey =
  | "name" | "societe" | "classification" | "vl" | "an"
  | "perf1m" | "perf3m" | "perf6m" | "perf1an";

export default function App() {
  const [historyIndex, setHistoryIndex] = useState<HistoryIndex | null>(null);
  const [dateSnapshot, setDateSnapshot] = useState<HistorySnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  const [isLoading, setIsLoading] = useState(true);

  // Onglet actif : "societes" reste la vue par défaut, inchangée.
  const [activeTab, setActiveTab] = useState<'societes' | 'fonds'>('societes');

  const [fundsData, setFundsData] = useState<FundsPayload | null>(null);
  const [fundsLoading, setFundsLoading] = useState(true);
  const [fundSearch, setFundSearch] = useState("");
  const [fundClassif, setFundClassif] = useState("All");
  const [fundIndice, setFundIndice] = useState("All");
  const [fundReseau, setFundReseau] = useState("All");
  const [fundDepositaire, setFundDepositaire] = useState("All");
  const [fundSensibilite, setFundSensibilite] = useState("All");
  const [fundSort, setFundSort] = useState<{ key: FundSortKey; dir: 'asc' | 'desc' }>({ key: 'an', dir: 'desc' });
  const [selectedFundIsins, setSelectedFundIsins] = useState<string[]>([]);
  const [topPeriod, setTopPeriod] = useState<'perf1m' | 'perf3m' | 'perf1an'>('perf1an');
  const [detailFund, setDetailFund] = useState<Fund | null>(null);

  const [selectedDate, setSelectedDate] = useState("All");
  const [selectedClassification, setSelectedClassification] = useState("All");
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});

  const COLORS = [
    '#FFC000',
    '#00478F',
    '#4A90E2',
    '#A6A6A6',
    '#1F3864',
    '#5B9BD5',
    '#7F7F7F'
  ];

  // ============================================================
  // CHARGEMENT DES DONNÉES
  // L'index (léger : dates + classifications) est chargé une fois. Le détail
  // par société d'UNE date précise n'est chargé qu'à la demande, quand la date
  // effective change — jamais tout l'historique d'un coup (voir HISTORY_BASE_URL).
  // ============================================================

  useEffect(() => {
    setIsLoading(true);

    fetch(HISTORY_JSON_URL)
      .then(response => {
        if (!response.ok) throw new Error("Erreur réseau");
        return response.json();
      })
      .then((data: HistoryIndex) => {
        setHistoryIndex(data);
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Erreur de connexion :", error);
        setIsLoading(false);
      });
  }, []);

  // Chargement indépendant du détail par fonds (n'affecte pas la vue Sociétés).
  useEffect(() => {
    setFundsLoading(true);

    fetch(FUNDS_JSON_URL)
      .then(response => {
        if (!response.ok) throw new Error("Erreur réseau");
        return response.json();
      })
      .then((data: FundsPayload) => {
        setFundsData(data);
        setFundsLoading(false);
      })
      .catch(error => {
        console.error("Erreur de connexion (fonds) :", error);
        setFundsLoading(false);
      });
  }, []);

  // ============================================================
  // SÉLECTION DE LA DATE
  // "All" affiche la publication la plus récente disponible.
  // ============================================================

  const effectiveDate = useMemo(() => {
    if (!historyIndex) return undefined;
    return selectedDate !== "All" ? selectedDate : historyIndex.dates[0]?.date;
  }, [historyIndex, selectedDate]);

  // Va chercher le détail (par société) de la date effective, une seule date à
  // la fois — pas tout l'historique. Se redéclenche à chaque changement de date.
  useEffect(() => {
    if (!effectiveDate) return;

    setSnapshotLoading(true);

    fetch(`${HISTORY_BASE_URL}/history/${effectiveDate}.json`)
      .then(response => {
        if (!response.ok) throw new Error("Erreur réseau");
        return response.json();
      })
      .then((data: HistorySnapshot) => {
        setDateSnapshot(data);
        setSnapshotLoading(false);
      })
      .catch(error => {
        console.error("Erreur de connexion (date) :", error);
        setSnapshotLoading(false);
      });
  }, [effectiveDate]);

  const dashboardData = useMemo(() => {
    if (!historyIndex) {
      return { filters: { dates: [], types: [], classifications: [] }, companies: [] as any[] };
    }

    const types = Array.from(new Set(historyIndex.dates.map(d => d.type)));

    return {
      filters: {
        dates: historyIndex.dates,
        types,
        classifications: historyIndex.classifications
      },
      // Garde les données de la date précédente affichées pendant le chargement
      // de la nouvelle plutôt que de vider l'écran à chaque changement de date.
      companies: dateSnapshot?.companies ?? []
    };
  }, [historyIndex, dateSnapshot]);

  // ============================================================
  // FILTRES
  // ============================================================

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
  };

  const companiesWithMainClassif = useMemo(() => {
    return dashboardData.companies.map(c => ({
      ...c,
      mainClassif:
        c.classifications && c.classifications.length > 0
          ? c.classifications[0]
          : "Diversifié"
    }));
  }, [dashboardData.companies]);

  const baseFiltered = useMemo(() => {
    return companiesWithMainClassif.filter(c =>
      searchQuery.trim() === "" ||
      (c.name &&
        c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [companiesWithMainClassif, searchQuery]);

  const strictFiltered = useMemo(() => {
    return baseFiltered.filter(c => {
      const matchClassif =
        selectedClassification === "All" ||
        c.mainClassif === selectedClassification;

      const matchCompany =
        activeCompany === null ||
        c.name === activeCompany;

      return matchClassif && matchCompany;
    });
  }, [
    baseFiltered,
    selectedClassification,
    activeCompany
  ]);

  // ============================================================
  // KPIs
  // ============================================================

  const metrics = useMemo(() => {
    const totalAssetsMd =
      strictFiltered.reduce(
        (acc, c) => acc + Number(c.assets || 0),
        0
      ) / 1000000000;

    const totalOpcvm =
      strictFiltered.reduce(
        (acc, c) => acc + Number(c.fundsCount || 0),
        0
      );

    const totalPositifs =
      strictFiltered.reduce(
        (acc, c) => acc + Number(c.positiveFundsCount || 0),
        0
      );

    const pctPositifs =
      totalOpcvm > 0
        ? (totalPositifs / totalOpcvm) * 100
        : 0;

    let sumYtd = 0;
    let validCount = 0;

    strictFiltered.forEach(c => {
      if (c.perf1Y != null && c.perf1Y !== "") {
        sumYtd += Number(c.perf1Y) * 100;
        validCount += 1;
      }
    });

    const avgYtd =
      validCount > 0
        ? sumYtd / validCount
        : 0;

    const avgFundSize =
      totalOpcvm > 0
        ? (totalAssetsMd * 1000) / totalOpcvm
        : 0;

    const sortedAssets = [...strictFiltered].sort(
      (a, b) =>
        Number(b.assets || 0) -
        Number(a.assets || 0)
    );

    const top3AssetsMd =
      sortedAssets
        .slice(0, 3)
        .reduce(
          (acc, c) =>
            acc + Number(c.assets || 0),
          0
        ) / 1000000000;

    const concentrationTop3 =
      totalAssetsMd > 0
        ? (top3AssetsMd / totalAssetsMd) * 100
        : 0;

    const cleanYtd =
      Number(avgYtd.toFixed(2));

    const formattedYtd =
      cleanYtd > 0
        ? `+${cleanYtd.toFixed(2)}`
        : cleanYtd.toFixed(2);

    return {
      totalAssetsMd,
      totalOpcvm,
      pctPositifs,
      formattedYtd,
      cleanYtd,
      avgFundSize,
      concentrationTop3
    };
  }, [strictFiltered]);

  // ============================================================
  // TOP PERFORMERS
  // ============================================================

  const top5Performers = useMemo(() => {
    return [...strictFiltered]
      .filter(
        c =>
          c.perf1Y != null &&
          c.perf1Y !== ""
      )
      .map(c => ({
        ...c,
        displayPerf:
          Number(c.perf1Y) * 100
      }))
      .sort(
        (a, b) =>
          b.displayPerf -
          a.displayPerf
      )
      .slice(0, 5);
  }, [strictFiltered]);

  // ============================================================
  // DONUT SOCIETES
  // ============================================================

  const pieSocData = useMemo(() => {
    return [...baseFiltered]
      .filter(
        c =>
          selectedClassification === "All" ||
          c.mainClassif === selectedClassification
      )
      .sort(
        (a, b) =>
          Number(b.assets || 0) -
          Number(a.assets || 0)
      );
  }, [
    baseFiltered,
    selectedClassification
  ]);

  const pieSocLegendPayload = useMemo(() => {
    return pieSocData.map((entry, index) => {
      const isFaded =
        activeCompany &&
        activeCompany !== entry.name;

      return {
        id: entry.name,
        type: 'square' as const,
        value: entry.name,
        color: isFaded
          ? '#cbd5e1'
          : COLORS[index % COLORS.length]
      };
    });
  }, [
    pieSocData,
    activeCompany
  ]);

  // ============================================================
  // DONUT CLASSIFICATION
  // ============================================================

  const pieClassifData = useMemo(() => {
    const filtered =
      baseFiltered.filter(
        c =>
          activeCompany === null ||
          c.name === activeCompany
      );

    const classifMap = new Map();

    filtered.forEach(c => {
      const current =
        classifMap.get(c.mainClassif) || 0;

      classifMap.set(
        c.mainClassif,
        current + Number(c.assets || 0)
      );
    });

    return Array.from(
      classifMap,
      ([name, value]) => ({
        name,
        value
      })
    ).sort(
      (a, b) =>
        Number(b.value || 0) -
        Number(a.value || 0)
    );
  }, [
    baseFiltered,
    activeCompany
  ]);

  const pieClassifLegendPayload = useMemo(() => {
    return pieClassifData.map(
      (entry, index) => {
        const isFaded =
          selectedClassification !== "All" &&
          selectedClassification !== entry.name;

        return {
          id: entry.name,
          type: 'square' as const,
          value: entry.name,
          color: isFaded
            ? '#cbd5e1'
            : COLORS[index % COLORS.length]
        };
      }
    );
  }, [
    pieClassifData,
    selectedClassification
  ]);

  // ============================================================
  // COMBO CHART
  // ============================================================

  const comboChartData = useMemo(() => {
    const sortedByAssets =
      [...strictFiltered].sort(
        (a, b) =>
          Number(b.assets || 0) -
          Number(a.assets || 0)
      );

    return sortedByAssets.map(c => {
      const safeName =
        c.name
          ? String(c.name)
          : "Inconnu";

      const safeCount =
        typeof c.fundsCount === 'number'
          ? c.fundsCount
          : 0;

      const safeAssets =
        typeof c.assets === 'number'
          ? c.assets / 1000000000
          : 0;

      return {
        name:
          safeName.length > 15
            ? safeName.substring(0, 15) + '...'
            : safeName,

        opcvm: safeCount,

        ytd:
          c.perf1Y != null &&
          c.perf1Y !== ""
            ? Number(
                (
                  Number(c.perf1Y) *
                  100
                ).toFixed(2)
              )
            : null,

        actifNet:
          Number(safeAssets.toFixed(2))
      };
    });
  }, [strictFiltered]);

  // ============================================================
  // INTERACTIONS
  // ============================================================

  const handleCompanyClick = (
    name: string
  ) => {
    setActiveCompany(prev =>
      prev === name
        ? null
        : name
    );
  };

  const handleClassifClick = (
    name: string
  ) => {
    setSelectedClassification(prev =>
      prev === name
        ? "All"
        : name
    );
  };

  const toggleLineLegend = (
    e: any
  ) => {
    setHiddenLines(prev => ({
      ...prev,
      [e.dataKey]:
        !prev[e.dataKey]
    }));
  };

  const renderPieSocLegendText = (
    value: string
  ) => {
    const isFaded =
      activeCompany &&
      activeCompany !== value;

    return (
      <span
        style={{
          color: isFaded
            ? '#cbd5e1'
            : '#475569',
          fontWeight:
            !activeCompany ||
            activeCompany === value
              ? '600'
              : '400',
          cursor: 'pointer'
        }}
      >
        {value}
      </span>
    );
  };

  const renderPieClassifLegendText = (
    value: string
  ) => {
    const isFaded =
      selectedClassification !== "All" &&
      selectedClassification !== value;

    return (
      <span
        style={{
          color: isFaded
            ? '#cbd5e1'
            : '#475569',
          fontWeight:
            selectedClassification === "All" ||
            selectedClassification === value
              ? '600'
              : '400',
          cursor: 'pointer'
        }}
      >
        {value}
      </span>
    );
  };

  const renderLineLegendText = (
    value: string,
    entry: any
  ) => {
    const isHidden =
      hiddenLines[entry.dataKey];

    return (
      <span
        style={{
          color: isHidden
            ? '#cbd5e1'
            : '#475569',
          textDecoration:
            isHidden
              ? 'line-through'
              : 'none',
          cursor: 'pointer',
          fontWeight: '500'
        }}
      >
        {value}
      </span>
    );
  };

  const createDonutLabel =
    (threshold: number) =>
    (props: any) => {
      const {
        cx,
        cy,
        midAngle,
        outerRadius,
        percent
      } = props;

      if (percent < threshold)
        return null;

      const radius =
        outerRadius + 6;

      const x =
        cx +
        radius *
          Math.cos(
            (-midAngle *
              Math.PI) /
              180
          );

      const y =
        cy +
        radius *
          Math.sin(
            (-midAngle *
              Math.PI) /
              180
          );

      return (
        <text
          x={x}
          y={y}
          fill="#1F3864"
          textAnchor={
            x > cx
              ? 'start'
              : 'end'
          }
          dominantBaseline="central"
          fontSize={9}
          fontWeight="600"
        >
          {(percent * 100)
            .toFixed(2)
            .replace('.', ',')}
          %
        </text>
      );
    };

  // ============================================================
  // EXPORT CSV
  // ============================================================

  const exportToCSV = () => {
    const headers = [
      "Societe de Gestion",
      "Actif Net (MAD)",
      "Nb OPCVM",
      "Perf YTD"
    ];

    const rows =
      strictFiltered.map(c => [
        `"${c.name}"`,
        c.assets,
        c.fundsCount,
        c.perf1Y
      ]);

    const csv =
      "data:text/csv;charset=utf-8," +
      [
        headers.join(","),
        ...rows.map(e =>
          e.join(",")
        )
      ].join("\n");

    const link =
      document.createElement("a");

    link.href =
      encodeURI(csv);

    link.download =
      `Export_ASFIM_${new Date()
        .toISOString()
        .split('T')[0]}.csv`;

    link.click();
  };

  // ============================================================
  // FONDS INDIVIDUELS — filtres, tri, comparateur
  // ============================================================

  const fundClassifOptions = useMemo(() => {
    if (!fundsData) return [];
    return Array.from(
      new Set(fundsData.funds.map(f => f.classification).filter((v): v is string => !!v))
    ).sort();
  }, [fundsData]);

  const fundIndiceOptions = useMemo(() => {
    if (!fundsData) return [];
    return Array.from(
      new Set(fundsData.funds.map(f => f.indiceBenchmark).filter((v): v is string => !!v))
    ).sort();
  }, [fundsData]);

  const fundReseauOptions = useMemo(() => {
    if (!fundsData) return [];
    const set = new Set<string>();
    fundsData.funds.forEach(f => (f.reseau || []).forEach(r => set.add(r)));
    return Array.from(set).sort();
  }, [fundsData]);

  const fundDepositaireOptions = useMemo(() => {
    if (!fundsData) return [];
    return Array.from(
      new Set(fundsData.funds.map(f => f.depositaire).filter((v): v is string => !!v))
    ).sort();
  }, [fundsData]);

  const fundSensibiliteOptions = useMemo(() => {
    if (!fundsData) return [];
    return Array.from(
      new Set(fundsData.funds.map(f => f.sensibilite).filter((v): v is string => !!v && v !== "-"))
    ).sort();
  }, [fundsData]);

  // Top 4 par catégorie : les meilleurs fonds de chaque classification sur la période choisie.
  const topByClassification = useMemo(() => {
    if (!fundsData) return [] as { classification: string; top: Fund[] }[];

    const groups = new Map<string, Fund[]>();
    fundsData.funds.forEach(f => {
      const key = f.classification ?? "Autre";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    });

    return Array.from(groups.entries())
      .map(([classification, funds]) => ({
        classification,
        top: [...funds]
          .filter(f => f[topPeriod] != null)
          .sort((a, b) => (b[topPeriod] as number) - (a[topPeriod] as number))
          .slice(0, 4),
      }))
      .filter(g => g.top.length > 0)
      .sort((a, b) => a.classification.localeCompare(b.classification));
  }, [fundsData, topPeriod]);

  const filteredFunds = useMemo(() => {
    if (!fundsData) return [] as Fund[];

    const q = fundSearch.trim().toLowerCase();

    const list = fundsData.funds.filter(f => {
      const matchSearch =
        q === "" ||
        (f.name && f.name.toLowerCase().includes(q)) ||
        (f.societe && f.societe.toLowerCase().includes(q));

      const matchClassif = fundClassif === "All" || f.classification === fundClassif;
      const matchIndice = fundIndice === "All" || f.indiceBenchmark === fundIndice;
      const matchReseau = fundReseau === "All" || (f.reseau || []).includes(fundReseau);
      const matchDepositaire = fundDepositaire === "All" || f.depositaire === fundDepositaire;
      const matchSensibilite = fundSensibilite === "All" || f.sensibilite === fundSensibilite;

      return matchSearch && matchClassif && matchIndice && matchReseau && matchDepositaire && matchSensibilite;
    });

    const { key, dir } = fundSort;
    const sign = dir === "asc" ? 1 : -1;

    return [...list].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (typeof av === "string" || typeof bv === "string") {
        return sign * String(av ?? "").localeCompare(String(bv ?? ""));
      }

      const an = av == null ? -Infinity : Number(av);
      const bn = bv == null ? -Infinity : Number(bv);
      return sign * (an - bn);
    });
  }, [fundsData, fundSearch, fundClassif, fundIndice, fundReseau, fundDepositaire, fundSensibilite, fundSort]);

  const handleFundSort = (key: FundSortKey) => {
    setFundSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };

  const toggleFundSelection = (isin: string | null) => {
    if (!isin) return;
    setSelectedFundIsins(prev =>
      prev.includes(isin)
        ? prev.filter(x => x !== isin)
        : prev.length >= 6
          ? prev
          : [...prev, isin]
    );
  };

  const comparedFunds = useMemo(() => {
    if (!fundsData) return [] as Fund[];
    return fundsData.funds.filter(f => f.isin && selectedFundIsins.includes(f.isin));
  }, [fundsData, selectedFundIsins]);

  const fmtPct = (v: number | null | undefined) => {
    if (v == null) return "—";
    const pct = v * 100;
    return `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
  };

  const fmtMad = (v: number | null | undefined) => {
    if (v == null) return "—";
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} Md`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`;
    return v.toFixed(2);
  };

  const exportFundsToCSV = () => {
    const headers = [
      "ISIN", "Fonds", "Societe de Gestion", "Classification", "Indice de reference",
      "Reseau", "Depositaire", "Sensibilite", "Periodicite VL", "Affectation des resultats",
      "VL (MAD)", "Actif Net (MAD)",
      "Commission souscription", "Commission rachat", "Frais de gestion",
      "Perf 1 mois", "Perf 3 mois", "Perf 6 mois", "Perf 1 an"
    ];

    const rows = filteredFunds.map(f => [
      `"${f.isin ?? ""}"`,
      `"${f.name ?? ""}"`,
      `"${f.societe ?? ""}"`,
      `"${f.classification ?? ""}"`,
      `"${f.indiceBenchmark ?? ""}"`,
      `"${(f.reseau || []).join(" / ")}"`,
      `"${f.depositaire ?? ""}"`,
      `"${f.sensibilite ?? ""}"`,
      `"${f.periodiciteVL ?? ""}"`,
      `"${f.affectationResultats ?? ""}"`,
      f.vl ?? "",
      f.an ?? "",
      f.commissionSouscription ?? "",
      f.commissionRachat ?? "",
      f.fraisGestion ?? "",
      f.perf1m ?? "",
      f.perf3m ?? "",
      f.perf6m ?? "",
      f.perf1an ?? "",
    ]);

    const csv =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `Export_ASFIM_Fonds_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // ============================================================
  // LOADING
  // ============================================================

  if (
    isLoading &&
    dashboardData.companies.length === 0
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-[#00478F] px-4">
        <RefreshCw className="w-8 h-8 animate-spin mr-3 text-[#FFC000]" />

        <p className="font-mono font-medium tracking-widest uppercase text-xs sm:text-sm text-center">
          Chargement des données...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#333333] flex flex-col font-sans overflow-x-hidden">

      {/* ======================================================
          HEADER RESPONSIVE
      ====================================================== */}

      <header className="bg-white px-4 sm:px-6 md:px-8 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm border-b border-slate-200">

        <div className="flex flex-col text-center md:text-left">
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-[#00478F] uppercase tracking-wide">
            L'Actualité des OPCVM
          </h2>

          <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-wider">
            Dashboard d'Analyse
          </span>
        </div>

        <div className="relative w-full md:w-auto md:max-w-xs md:min-w-[240px]">

          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </span>

          <input
            type="text"
            placeholder="Rechercher une société..."
            value={searchQuery}
            onChange={e =>
              setSearchQuery(
                e.target.value
              )
            }
            className="w-full bg-white border border-[#A6A6A6]/60 shadow-sm text-slate-800 placeholder-slate-400 rounded-sm pl-9 pr-3 py-2.5 md:py-1.5 text-xs font-medium focus:outline-none focus:border-[#00478F] focus:ring-1 focus:ring-[#00478F] transition-all"
          />

        </div>

        <div className="bg-[#FFC000] text-white px-4 py-2 md:py-1.5 flex flex-row md:flex-col items-center justify-center shadow-sm rounded-sm">

          <span className="text-[8px] font-bold uppercase tracking-widest opacity-90 mr-2 md:mr-0">
            Date Réf.
          </span>

          <span className="text-base md:text-lg font-bold tracking-tight leading-none">
            {selectedDate !== "All"
              ? selectedDate
              : historyIndex?.dates[0]?.date ?? "—"}
          </span>

        </div>

      </header>

      <div className="h-0.5 w-full bg-[#FFC000]" />

      {/* ======================================================
          FILTRES RESPONSIVE
      ====================================================== */}

      <nav className="bg-white px-4 sm:px-6 md:px-8 py-4 flex flex-col lg:flex-row gap-4 shadow-sm z-10 border-b border-slate-200">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-auto lg:flex-1">

          <div className="flex flex-col w-full">
            <label className="text-[8px] text-[#4A90E2] font-bold tracking-widest uppercase mb-1 flex items-center">
              <Calendar className="w-2.5 h-2.5 mr-1" />
              Publication
            </label>

            <select
              value={selectedDate}
              onChange={e =>
                handleDateChange(
                  e.target.value
                )
              }
              className="w-full text-xs font-semibold bg-transparent border border-slate-200 rounded-sm px-2 py-2 md:border-0 md:border-b md:px-0 md:py-0.5 focus:outline-none focus:border-[#00478F] text-[#00478F] cursor-pointer"
            >
              <option value="All">
                Toutes les dates
              </option>

              {dashboardData.filters.dates.map(
                (d: any) => (
                  <option
                    key={d.date}
                    value={d.date}
                  >
                    {d.date} ({d.type})
                  </option>
                )
              )}
            </select>
          </div>

          <div className="flex flex-col w-full">
            <label className="text-[8px] text-[#4A90E2] font-bold tracking-widest uppercase mb-1 flex items-center">
              <Layers className="w-2.5 h-2.5 mr-1" />
              Classification
            </label>

            <select
              value={
                selectedClassification
              }
              onChange={e =>
                setSelectedClassification(
                  e.target.value
                )
              }
              className="w-full text-xs font-semibold bg-transparent border border-slate-200 rounded-sm px-2 py-2 md:border-0 md:border-b md:px-0 md:py-0.5 focus:outline-none focus:border-[#00478F] text-[#00478F] cursor-pointer"
            >
              <option value="All">
                Toutes Classifications
              </option>

              {dashboardData.filters.classifications.map(
                (cl: any) => (
                  <option
                    key={cl}
                    value={cl}
                  >
                    {cl}
                  </option>
                )
              )}
            </select>
          </div>

        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">

          <button
            onClick={() =>
              window.location.reload()
            }
            className="flex-1 sm:flex-none justify-center hover:bg-slate-50 text-[#00478F] px-3 py-2.5 md:py-1.5 rounded-sm text-[10px] font-bold border border-slate-200 flex items-center transition-colors"
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Actualiser
          </button>

          <button
            onClick={exportToCSV}
            className="flex-1 sm:flex-none justify-center bg-[#4A90E2] hover:bg-[#357ABD] text-white px-3 py-2.5 md:py-1.5 rounded-sm text-[10px] font-bold transition-colors flex items-center"
          >
            <Download className="w-3 h-3 mr-1.5" />
            Exporter
          </button>

        </div>

      </nav>

      {/* ======================================================
          ONGLETS — Sociétés (existant) / Fonds (nouveau)
      ====================================================== */}

      <div className="bg-white px-4 sm:px-6 md:px-8 flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('societes')}
          className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'societes'
              ? 'border-[#00478F] text-[#00478F]'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Sociétés
        </button>
        <button
          onClick={() => setActiveTab('fonds')}
          className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'fonds'
              ? 'border-[#00478F] text-[#00478F]'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Fonds
        </button>
      </div>

      {/* ======================================================
          CONTENU PRINCIPAL — VUE SOCIÉTÉS (inchangée)
      ====================================================== */}

      {activeTab === 'societes' && (
      <main className="flex-1 p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-[1600px] w-full mx-auto">

        {/* ====================================================
            KPIs
        ==================================================== */}

        <section className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">

          <div className="bg-white p-3.5 rounded-sm border-t-2 border-t-[#00478F] shadow-sm border border-slate-200/60 flex flex-col justify-between min-h-[82px]">
            <p className="text-[9px] text-[#595959] font-bold uppercase tracking-wider mb-1">
              Actif Net Total
            </p>

            <p className="text-lg md:text-xl font-semibold tracking-tight text-[#00478F]">
              {metrics.totalAssetsMd.toFixed(2)}

              <span className="text-[10px] font-medium text-slate-400 ml-1">
                Md MAD
              </span>
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-sm border-t-2 border-t-[#00478F] shadow-sm border border-slate-200/60 flex flex-col justify-between min-h-[82px]">
            <p className="text-[9px] text-[#595959] font-bold uppercase tracking-wider mb-1">
              Nombre OPCVM
            </p>

            <p className="text-lg md:text-xl font-semibold tracking-tight text-[#00478F]">
              {metrics.totalOpcvm}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-sm border-t-2 border-t-[#FFC000] shadow-sm border border-slate-200/60 flex flex-col justify-between relative min-h-[82px]">
            <div className="flex justify-between items-start">
              <p className="text-[9px] text-[#595959] font-bold uppercase tracking-wider mb-1">
                Moyenne YTD
              </p>

              <Info className="w-3 h-3 text-slate-300" />
            </div>

            <p
              className={`text-lg md:text-xl font-semibold tracking-tight ${
                metrics.cleanYtd >= 0
                  ? 'text-emerald-600'
                  : 'text-rose-600'
              }`}
            >
              {metrics.formattedYtd}%
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-sm border-t-2 border-t-[#4A90E2] shadow-sm border border-slate-200/60 flex flex-col justify-between relative min-h-[82px]">
            <div className="flex justify-between items-start">
              <p className="text-[9px] text-[#595959] font-bold uppercase tracking-wider mb-1">
                Fonds Positifs
              </p>

              <Info className="w-3 h-3 text-slate-300" />
            </div>

            <p className="text-lg md:text-xl font-semibold tracking-tight text-[#4A90E2]">
              {metrics.pctPositifs.toFixed(1)}%
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-sm border-t-2 border-t-[#A6A6A6] shadow-sm border border-slate-200/60 flex flex-col justify-between relative min-h-[82px]">
            <div className="flex justify-between items-start">
              <p className="text-[9px] text-[#595959] font-bold uppercase tracking-wider mb-1">
                Concentration Top 3
              </p>

              <Info className="w-3 h-3 text-slate-300" />
            </div>

            <p className="text-lg md:text-xl font-semibold tracking-tight text-[#595959]">
              {metrics.concentrationTop3.toFixed(1)}%
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-sm border-t-2 border-t-[#A6A6A6] shadow-sm border border-slate-200/60 flex flex-col justify-between min-h-[82px]">
            <p className="text-[9px] text-[#595959] font-bold uppercase tracking-wider mb-1">
              Moyenne Actifs Nets
            </p>

            <p className="text-lg md:text-xl font-semibold tracking-tight text-[#595959]">
              {metrics.avgFundSize.toFixed(0)}

              <span className="text-[10px] font-medium text-slate-400 ml-1">
                M MAD
              </span>
            </p>
          </div>

        </section>

        {/* ====================================================
            TOP + DONUTS
        ==================================================== */}

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">

          {/* TOP 5 */}

          <div className="bg-white p-4 rounded-sm shadow-sm border border-slate-200/60 flex flex-col lg:col-span-1 min-h-[260px]">

            <h3 className="text-[10px] text-[#00478F] font-bold uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">
              Top 5 Performances
            </h3>

            <div className="space-y-3 flex-1 flex flex-col justify-center">

              {top5Performers.map((c, i) => (

                <div
                  key={c.id}
                  className="flex justify-between items-center cursor-pointer hover:bg-slate-50 px-1 py-1 rounded transition-colors gap-2"
                  onClick={() =>
                    handleCompanyClick(
                      c.name
                    )
                  }
                >

                  <div className="flex items-center gap-2 min-w-0">

                    <span className="text-[10px] font-bold text-slate-400 w-3 flex-shrink-0">
                      {i + 1}.
                    </span>

                    <span
                      className={`text-[11px] font-semibold truncate transition-colors ${
                        activeCompany === c.name
                          ? 'text-[#FFC000]'
                          : 'text-[#333333]'
                      }`}
                      title={c.name}
                    >
                      {c.name}
                    </span>

                  </div>

                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm flex-shrink-0 ${
                      c.displayPerf >= 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {c.displayPerf > 0
                      ? '+'
                      : ''}
                    {c.displayPerf.toFixed(2)}%
                  </span>

                </div>

              ))}

              {top5Performers.length === 0 && (
                <p className="text-xs text-slate-400 text-center italic">
                  Données YTD indisponibles
                </p>
              )}

            </div>

          </div>

          {/* ==================================================
              DONUT SOCIETES
          ================================================== */}

          <div className="bg-white p-4 rounded-sm shadow-sm border border-slate-200/60 flex flex-col lg:col-span-2 w-full min-w-0">

            <h3 className="text-[10px] text-[#4A90E2] font-bold uppercase tracking-widest mb-2 border-b border-slate-100 w-full pb-2">
              Actif par Société
            </h3>

            <div className="w-full h-[360px] sm:h-[300px]">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>

                  <Pie
                    data={pieSocData}
                    dataKey="assets"
                    nameKey="name"
                    cx="32%"
                    cy="50%"
                    innerRadius="25%"
                    outerRadius="38%"
                    paddingAngle={1}
                    isAnimationActive={false}
                    onClick={(data) =>
                      handleCompanyClick(
                        data.name
                      )
                    }
                    cursor="pointer"
                    stroke="none"
                    label={createDonutLabel(0.04)}
                    labelLine={false}
                  >

                    {pieSocData.map(
                      (entry, index) => {

                        const isFaded =
                          activeCompany &&
                          activeCompany !==
                            entry.name;

                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              isFaded
                                ? '#F1F5F9'
                                : COLORS[
                                    index %
                                      COLORS.length
                                  ]
                            }
                          />
                        );
                      }
                    )}

                  </Pie>

                  <RechartsTooltip
                    formatter={(
                      value: number
                    ) =>
                      `${(
                        value /
                        1000000000
                      ).toFixed(
                        2
                      )} Md MAD`
                    }
                  />

                  <Legend
                    payload={
                      pieSocLegendPayload
                    }
                    onClick={e =>
                      handleCompanyClick(
                        e.value
                      )
                    }
                    formatter={val =>
                      renderPieSocLegendText(
                        val
                      )
                    }
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{
                      maxHeight: '85%',
                      overflowY: 'auto',
                      fontSize: '10px',
                      right: 0,
                      width: '42%',
                      lineHeight: '18px'
                    }}
                  />

                </PieChart>
              </ResponsiveContainer>

            </div>

          </div>

          {/* ==================================================
              DONUT CLASSIFICATION
          ================================================== */}

          <div className="bg-white p-4 rounded-sm shadow-sm border border-slate-200/60 flex flex-col lg:col-span-2 w-full min-w-0">

            <h3 className="text-[10px] text-[#4A90E2] font-bold uppercase tracking-widest mb-2 border-b border-slate-100 w-full pb-2">
              Actif par Classification
            </h3>

            <div className="w-full h-[360px] sm:h-[300px]">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>

                  <Pie
                    data={pieClassifData}
                    dataKey="value"
                    nameKey="name"
                    cx="32%"
                    cy="50%"
                    innerRadius="25%"
                    outerRadius="38%"
                    paddingAngle={1}
                    isAnimationActive={false}
                    onClick={(data) =>
                      handleClassifClick(
                        data.name
                      )
                    }
                    cursor="pointer"
                    stroke="none"
                    label={createDonutLabel(0.02)}
                    labelLine={false}
                  >

                    {pieClassifData.map(
                      (entry, index) => {

                        const isFaded =
                          selectedClassification !==
                            "All" &&
                          selectedClassification !==
                            entry.name;

                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              isFaded
                                ? '#F1F5F9'
                                : COLORS[
                                    index %
                                      COLORS.length
                                  ]
                            }
                          />
                        );
                      }
                    )}

                  </Pie>

                  <RechartsTooltip
                    formatter={(
                      value: number
                    ) =>
                      `${(
                        value /
                        1000000000
                      ).toFixed(
                        2
                      )} Md MAD`
                    }
                  />

                  <Legend
                    payload={
                      pieClassifLegendPayload
                    }
                    onClick={e =>
                      handleClassifClick(
                        e.value
                      )
                    }
                    formatter={val =>
                      renderPieClassifLegendText(
                        val
                      )
                    }
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{
                      maxHeight: '85%',
                      overflowY: 'auto',
                      fontSize: '10px',
                      right: 0,
                      width: '42%',
                      lineHeight: '18px'
                    }}
                  />

                </PieChart>
              </ResponsiveContainer>

            </div>

          </div>

        </section>

        {/* ====================================================
            GRAPHIQUE PRINCIPAL
        ==================================================== */}

        <section className="bg-white p-4 sm:p-5 rounded-sm shadow-sm border border-slate-200/60">

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4 sm:mb-6 border-b border-slate-100 pb-2">

            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#00478F]">
              Indices de performance & Encours
            </h3>

          </div>

          <div className="w-full h-[420px] sm:h-[350px] overflow-hidden">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <ComposedChart
                data={comboChartData}
                margin={{
                  top: 10,
                  right: 5,
                  bottom: 60,
                  left: -20
                }}
              >

                <CartesianGrid
                  stroke="#F8F9FA"
                  vertical={false}
                />

                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  tick={{
                    fontSize: 8,
                    fill: '#8C8C8C',
                    fontWeight: 500
                  }}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />

                <YAxis
                  yAxisId="left"
                  tick={{
                    fontSize: 9,
                    fill: '#8C8C8C',
                    fontWeight: 500
                  }}
                  orientation="left"
                  axisLine={false}
                  tickLine={false}
                />

                <YAxis
                  yAxisId="right"
                  tick={{
                    fontSize: 9,
                    fill: '#8C8C8C',
                    fontWeight: 500
                  }}
                  orientation="right"
                  tickFormatter={val =>
                    `${val}%`
                  }
                  axisLine={false}
                  tickLine={false}
                />

                <RechartsTooltip
                  contentStyle={{
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: 'none',
                    boxShadow:
                      '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    fontWeight: 600
                  }}
                />

                <Legend
                  onClick={
                    toggleLineLegend
                  }
                  formatter={(
                    val,
                    entry
                  ) =>
                    renderLineLegendText(
                      val,
                      entry
                    )
                  }
                  verticalAlign="top"
                  wrapperStyle={{
                    fontSize: '10px',
                    paddingBottom: '20px'
                  }}
                />

                <Bar
                  yAxisId="left"
                  dataKey="opcvm"
                  name="Nombre de OPCVM"
                  fill="#5B9BD5"
                  radius={[
                    2,
                    2,
                    0,
                    0
                  ]}
                  barSize={16}
                  hide={
                    hiddenLines[
                      "opcvm"
                    ]
                  }
                />

                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="actifNet"
                  name="Actif Net (Md MAD)"
                  stroke="#00478F"
                  strokeWidth={2}
                  dot={{
                    r: 2.5,
                    fill: '#00478F',
                    strokeWidth: 0
                  }}
                  hide={
                    hiddenLines[
                      "actifNet"
                    ]
                  }
                />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="ytd"
                  name="Var YTD (%)"
                  stroke="#FFC000"
                  strokeWidth={2}
                  dot={false}
                  hide={
                    hiddenLines[
                      "ytd"
                    ]
                  }
                  connectNulls={false}
                />

              </ComposedChart>
            </ResponsiveContainer>

          </div>

        </section>

      </main>
      )}

      {/* ======================================================
          CONTENU PRINCIPAL — VUE FONDS (nouveau)
      ====================================================== */}

      {activeTab === 'fonds' && (
      <main className="flex-1 p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-[1600px] w-full mx-auto">

        {fundsLoading && !fundsData && (
          <p className="text-xs text-slate-400 text-center py-12">Chargement des fonds…</p>
        )}

        {!fundsLoading && fundsData && (
          <>
            {/* ================================================
                FILTRES FONDS
            ================================================ */}

            <section className="bg-white p-4 rounded-sm shadow-sm border border-slate-200/60">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#00478F]" />
                  <h3 className="text-[10px] text-[#00478F] font-bold uppercase tracking-widest">
                    {fundsData.count} fonds — publication du {fundsData.date}
                  </h3>
                </div>

                <button
                  onClick={exportFundsToCSV}
                  className="self-start sm:self-auto bg-[#4A90E2] hover:bg-[#357ABD] text-white px-3 py-1.5 rounded-sm text-[10px] font-bold transition-colors flex items-center"
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  Exporter
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Rechercher un fonds ou une société..."
                    value={fundSearch}
                    onChange={e => setFundSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-sm pl-9 pr-3 py-2 text-xs font-medium focus:outline-none focus:border-[#00478F] focus:ring-1 focus:ring-[#00478F]"
                  />
                </div>

                <select
                  value={fundClassif}
                  onChange={e => setFundClassif(e.target.value)}
                  className="w-full text-xs font-semibold bg-transparent border border-slate-200 rounded-sm px-2 py-2 focus:outline-none focus:border-[#00478F] text-[#00478F] cursor-pointer"
                >
                  <option value="All">Toutes classifications</option>
                  {fundClassifOptions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={fundIndice}
                  onChange={e => setFundIndice(e.target.value)}
                  className="w-full text-xs font-semibold bg-transparent border border-slate-200 rounded-sm px-2 py-2 focus:outline-none focus:border-[#00478F] text-[#00478F] cursor-pointer"
                >
                  <option value="All">Tous indices de référence</option>
                  {fundIndiceOptions.map(i => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>

                <select
                  value={fundReseau}
                  onChange={e => setFundReseau(e.target.value)}
                  className="w-full text-xs font-semibold bg-transparent border border-slate-200 rounded-sm px-2 py-2 focus:outline-none focus:border-[#00478F] text-[#00478F] cursor-pointer"
                >
                  <option value="All">Tous réseaux</option>
                  {fundReseauOptions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                <select
                  value={fundDepositaire}
                  onChange={e => setFundDepositaire(e.target.value)}
                  className="w-full text-xs font-semibold bg-transparent border border-slate-200 rounded-sm px-2 py-2 focus:outline-none focus:border-[#00478F] text-[#00478F] cursor-pointer"
                >
                  <option value="All">Tous dépositaires</option>
                  {fundDepositaireOptions.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                <select
                  value={fundSensibilite}
                  onChange={e => setFundSensibilite(e.target.value)}
                  className="w-full text-xs font-semibold bg-transparent border border-slate-200 rounded-sm px-2 py-2 focus:outline-none focus:border-[#00478F] text-[#00478F] cursor-pointer"
                >
                  <option value="All">Toutes sensibilités</option>
                  {fundSensibiliteOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </section>

            {/* ================================================
                TOP 4 PAR CATEGORIE
            ================================================ */}

            <section className="bg-white p-4 rounded-sm shadow-sm border border-slate-200/60">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <h3 className="text-[10px] text-[#00478F] font-bold uppercase tracking-widest">
                  Top 4 par catégorie
                </h3>

                <div className="flex gap-1">
                  {([
                    ["perf1m", "1 mois"],
                    ["perf3m", "3 mois"],
                    ["perf1an", "1 an"],
                  ] as ['perf1m' | 'perf3m' | 'perf1an', string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTopPeriod(key)}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-sm border transition-colors ${
                        topPeriod === key
                          ? 'bg-[#00478F] text-white border-[#00478F]'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-[#00478F]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {topByClassification.length === 0 && (
                <p className="text-xs text-slate-400 text-center italic py-4">
                  Pas de données de performance disponibles pour cette période.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {topByClassification.map(group => (
                  <div key={group.classification} className="border border-slate-100 rounded-sm p-3">
                    <h4 className="text-[10px] text-[#4A90E2] font-bold uppercase tracking-widest mb-2 pb-2 border-b border-slate-100">
                      {group.classification}
                    </h4>

                    <div className="space-y-2">
                      {group.top.map((f, i) => {
                        const perf = f[topPeriod] as number;
                        return (
                          <div
                            key={f.isin ?? f.name}
                            className="flex justify-between items-center gap-2 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded transition-colors"
                            onClick={() => toggleFundSelection(f.isin)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-bold text-slate-400 w-3 flex-shrink-0">{i + 1}.</span>
                              <span className="text-[11px] font-semibold text-[#333333] truncate" title={f.name ?? ""}>
                                {f.name}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm flex-shrink-0 ${
                                perf >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {fmtPct(perf)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ================================================
                COMPARATEUR (fonds cochés)
            ================================================ */}

            {comparedFunds.length > 0 && (
              <section className="bg-white p-4 rounded-sm shadow-sm border border-[#00478F]/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] text-[#00478F] font-bold uppercase tracking-widest">
                    Comparateur ({comparedFunds.length}/6)
                  </h3>
                  <button
                    onClick={() => setSelectedFundIsins([])}
                    className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold"
                  >
                    Tout retirer
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] min-w-[640px]">
                    <thead>
                      <tr className="text-left text-slate-400 uppercase text-[9px] tracking-wider">
                        <th className="pb-2 pr-3"></th>
                        {comparedFunds.map(f => (
                          <th key={f.isin} className="pb-2 pr-4 font-bold text-[#00478F]">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate max-w-[140px]" title={f.name ?? ""}>{f.name}</span>
                              <button onClick={() => toggleFundSelection(f.isin)} className="text-slate-300 hover:text-rose-500 flex-shrink-0">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {[
                        { label: "Société", get: (f: Fund) => f.societe ?? "—" },
                        { label: "Classification", get: (f: Fund) => f.classification ?? "—" },
                        { label: "Indice", get: (f: Fund) => f.indiceBenchmark ?? "—" },
                        { label: "VL (MAD)", get: (f: Fund) => f.vl?.toFixed(2) ?? "—" },
                        { label: "Actif net", get: (f: Fund) => fmtMad(f.an) },
                        { label: "1 mois", get: (f: Fund) => fmtPct(f.perf1m) },
                        { label: "3 mois", get: (f: Fund) => fmtPct(f.perf3m) },
                        { label: "1 an", get: (f: Fund) => fmtPct(f.perf1an) },
                      ].map(row => (
                        <tr key={row.label}>
                          <td className="py-1.5 pr-3 text-slate-400 font-semibold whitespace-nowrap">{row.label}</td>
                          {comparedFunds.map(f => (
                            <td key={f.isin} className="py-1.5 pr-4 font-medium text-[#333333] whitespace-nowrap">
                              {row.get(f)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ================================================
                TABLEAU DES FONDS
            ================================================ */}

            <section className="bg-white rounded-sm shadow-sm border border-slate-200/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[860px]">
                  <thead>
                    <tr className="text-left text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-100">
                      <th className="px-4 py-2.5 w-8"></th>
                      {([
                        ["name", "Fonds"],
                        ["societe", "Société"],
                        ["classification", "Classif."],
                        ["vl", "VL"],
                        ["an", "Actif net"],
                        ["perf1m", "1 mois"],
                        ["perf3m", "3 mois"],
                        ["perf6m", "6 mois"],
                        ["perf1an", "1 an"],
                      ] as [FundSortKey, string][]).map(([key, label]) => (
                        <th
                          key={key}
                          onClick={() => handleFundSort(key)}
                          className="px-4 py-2.5 font-bold cursor-pointer hover:text-[#00478F] select-none whitespace-nowrap"
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            <ArrowUpDown className={`w-2.5 h-2.5 ${fundSort.key === key ? 'text-[#00478F]' : 'text-slate-300'}`} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredFunds.map(f => (
                      <tr key={f.isin ?? f.name} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={!!f.isin && selectedFundIsins.includes(f.isin)}
                            onChange={() => toggleFundSelection(f.isin)}
                            className="accent-[#00478F] cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap max-w-[220px] truncate">
                          <button
                            onClick={() => setDetailFund(f)}
                            className="font-semibold text-[#00478F] hover:underline truncate max-w-full text-left"
                            title={`Voir la fiche de ${f.name ?? ""}`}
                          >
                            {f.name}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap max-w-[180px] truncate" title={f.societe ?? ""}>
                          {f.societe}
                        </td>
                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{f.classification}</td>
                        <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{f.vl?.toFixed(2) ?? "—"}</td>
                        <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtMad(f.an)}</td>
                        <td className={`px-4 py-2 whitespace-nowrap font-semibold ${(f.perf1m ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(f.perf1m)}</td>
                        <td className={`px-4 py-2 whitespace-nowrap font-semibold ${(f.perf3m ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(f.perf3m)}</td>
                        <td className={`px-4 py-2 whitespace-nowrap font-semibold ${(f.perf6m ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(f.perf6m)}</td>
                        <td className={`px-4 py-2 whitespace-nowrap font-semibold ${(f.perf1an ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(f.perf1an)}</td>
                      </tr>
                    ))}

                    {filteredFunds.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-slate-400 italic">
                          Aucun fonds ne correspond à ces filtres.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

      </main>
      )}

      {/* ======================================================
          FICHE DETAIL D'UN FONDS
      ====================================================== */}

      {detailFund && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setDetailFund(null)}
        >
          <div
            className="bg-white rounded-sm shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#00478F] truncate">{detailFund.name}</h3>
                <p className="text-[11px] text-slate-500 truncate">{detailFund.societe}</p>
              </div>
              <button
                onClick={() => setDetailFund(null)}
                className="text-slate-400 hover:text-slate-600 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <h4 className="text-[9px] text-[#4A90E2] font-bold uppercase tracking-widest mb-2">
                  Caractéristiques
                </h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  {[
                    ["ISIN", detailFund.isin ?? "—"],
                    ["Classification", detailFund.classification ?? "—"],
                    ["Indice de référence", detailFund.indiceBenchmark ?? "—"],
                    ["Réseau", (detailFund.reseau || []).join(", ") || "—"],
                    ["Dépositaire", detailFund.depositaire ?? "—"],
                    ["Sensibilité au risque", detailFund.sensibilite ?? "—"],
                    ["Périodicité VL", detailFund.periodiciteVL ?? "—"],
                    ["Affectation des résultats", detailFund.affectationResultats ?? "—"],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="text-slate-400 font-semibold">{label}</dt>
                      <dd className="text-[#333333] font-medium truncate" title={value}>{value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>

              <div>
                <h4 className="text-[9px] text-[#4A90E2] font-bold uppercase tracking-widest mb-2">
                  Frais
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ["Souscription", detailFund.commissionSouscription],
                    ["Rachat", detailFund.commissionRachat],
                    ["Gestion", detailFund.fraisGestion],
                  ].map(([label, value]) => (
                    <div key={label as string} className="border border-slate-100 rounded-sm p-2.5">
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</div>
                      <div className="text-[13px] font-semibold text-[#333333]">{fmtPct(value as number | null)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-[9px] text-[#4A90E2] font-bold uppercase tracking-widest mb-2">
                  Valeur &amp; performance
                </h4>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="border border-slate-100 rounded-sm p-2.5">
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">VL (MAD)</div>
                    <div className="text-[13px] font-semibold text-[#333333]">{detailFund.vl?.toFixed(2) ?? "—"}</div>
                  </div>
                  <div className="border border-slate-100 rounded-sm p-2.5">
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Actif net</div>
                    <div className="text-[13px] font-semibold text-[#333333]">{fmtMad(detailFund.an)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {[
                    ["1j", detailFund.perf1j],
                    ["1s", detailFund.perf1s],
                    ["1m", detailFund.perf1m],
                    ["3m", detailFund.perf3m],
                    ["6m", detailFund.perf6m],
                    ["1an", detailFund.perf1an],
                    ["2ans", detailFund.perf2ans],
                    ["3ans", detailFund.perf3ans],
                    ["5ans", detailFund.perf5ans],
                  ].map(([label, value]) => (
                    <div key={label as string} className="text-center border border-slate-100 rounded-sm py-2">
                      <div className="text-[9px] text-slate-400 font-bold uppercase mb-1">{label}</div>
                      <div className={`text-[11px] font-bold ${((value as number) ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {fmtPct(value as number | null)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}