import React, { useState, useMemo, useEffect } from 'react';
import { Search, Download, Layers, Calendar, RefreshCw, Info } from 'lucide-react';
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

// Fichier statique généré chaque jour par le workflow GitHub Actions (ASFIM_Downloader/build_history.py)
// et publié sur Vercel Blob. Remplace l'ancien appel live à l'API Render.
// Configurable via VITE_HISTORY_JSON_URL (voir .env.example) pour ne pas coder l'URL du store en dur.
const HISTORY_JSON_URL =
  import.meta.env.VITE_HISTORY_JSON_URL ||
  "https://REPLACE_WITH_YOUR_BLOB_STORE.public.blob.vercel-storage.com/history.json";

type HistorySnapshot = {
  type: string;
  companies: any[];
  hierarchy: any[];
};

type HistoryPayload = {
  generated_at: string;
  classifications: string[];
  dates: { date: string; type: string }[];
  history: Record<string, HistorySnapshot>;
};

export default function App() {
  const [fullHistory, setFullHistory] = useState<HistoryPayload | null>(null);

  const [isLoading, setIsLoading] = useState(true);

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
  // CHARGEMENT DES DONNÉES (un seul fetch, tout l'historique)
  // ============================================================

  useEffect(() => {
    setIsLoading(true);

    fetch(HISTORY_JSON_URL, { cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error("Erreur réseau");
        return response.json();
      })
      .then((data: HistoryPayload) => {
        setFullHistory(data);
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Erreur de connexion :", error);
        setIsLoading(false);
      });
  }, []);

  // ============================================================
  // SÉLECTION DE LA DATE (filtrage 100% côté client)
  // "All" affiche la publication la plus récente disponible.
  // ============================================================

  const dashboardData = useMemo(() => {
    if (!fullHistory) {
      return { filters: { dates: [], types: [], classifications: [] }, companies: [] as any[] };
    }

    const effectiveDate = selectedDate !== "All" ? selectedDate : fullHistory.dates[0]?.date;
    const snapshot = fullHistory.history[effectiveDate] || { companies: [], hierarchy: [] };
    const types = Array.from(new Set(fullHistory.dates.map(d => d.type)));

    return {
      filters: {
        dates: fullHistory.dates,
        types,
        classifications: fullHistory.classifications
      },
      companies: snapshot.companies
    };
  }, [fullHistory, selectedDate]);

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
              : fullHistory?.dates[0]?.date ?? "—"}
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
          CONTENU PRINCIPAL
      ====================================================== */}

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

    </div>
  );
}