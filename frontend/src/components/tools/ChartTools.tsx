'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { BarChart3, LineChart, PieChart, ScatterChart, Activity } from 'lucide-react';

export function ChartTools() {
  const [chartData, setChartData] = useState('');
  const [chartTitle, setChartTitle] = useState('');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const parseData = (): unknown[] | null => {
    try {
      return JSON.parse(chartData);
    } catch {
      return null;
    }
  };

  const handleBarChart = async () => {
    const data = parseData();
    if (!data || !chartTitle) return;
    setLoading(true);
    try {
      const res = await api.createBarChart(data, chartTitle);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleLineChart = async () => {
    const data = parseData();
    if (!data || !chartTitle) return;
    setLoading(true);
    try {
      const res = await api.createLineChart(data, chartTitle);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handlePieChart = async () => {
    const data = parseData();
    if (!data || !chartTitle) return;
    setLoading(true);
    try {
      const res = await api.createPieChart(data, chartTitle);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleScatterPlot = async () => {
    const data = parseData();
    if (!data || !chartTitle) return;
    setLoading(true);
    try {
      const res = await api.createScatterPlot(data, chartTitle);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleHistogram = async () => {
    const data = parseData();
    if (!data || !chartTitle) return;
    setLoading(true);
    try {
      const res = await api.createHistogram(data, chartTitle);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Chart Data Input */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Diagramm erstellen
        </h3>

        <div className="space-y-4">
          <Input
            data-testid="tools_input_chart_title"
            placeholder="Diagramm-Titel"
            value={chartTitle}
            onChange={(e) => setChartTitle(e.target.value)}
          />

          <textarea
            data-testid="tools_textarea_chart_data"
            className="w-full h-32 p-3 font-mono text-sm border rounded-lg bg-white dark:bg-dark-800 border-dark-200 dark:border-dark-700 text-dark-900 dark:text-white"
            placeholder='[{"label": "Januar", "value": 100}, {"label": "Februar", "value": 150}]'
            value={chartData}
            onChange={(e) => setChartData(e.target.value)}
          />

          <div className="text-sm text-dark-500 dark:text-dark-400">
            Beispiel-Formate:
            <ul className="list-disc list-inside mt-1">
              <li>Bar/Line: {`[{"label": "A", "value": 10}]`}</li>
              <li>Pie: {`[{"name": "Teil A", "value": 30}]`}</li>
              <li>Scatter: {`[{"x": 1, "y": 2}]`}</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Chart Type Buttons */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Diagramm-Typ wählen</h3>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Button
            data-testid="tools_button_bar_chart"
            onClick={handleBarChart}
            loading={loading}
            disabled={!chartData || !chartTitle}
            variant="secondary"
            className="flex-col h-24"
          >
            <BarChart3 className="w-8 h-8 mb-2" />
            Balken
          </Button>

          <Button
            data-testid="tools_button_line_chart"
            onClick={handleLineChart}
            loading={loading}
            disabled={!chartData || !chartTitle}
            variant="secondary"
            className="flex-col h-24"
          >
            <LineChart className="w-8 h-8 mb-2" />
            Linie
          </Button>

          <Button
            data-testid="tools_button_pie_chart"
            onClick={handlePieChart}
            loading={loading}
            disabled={!chartData || !chartTitle}
            variant="secondary"
            className="flex-col h-24"
          >
            <PieChart className="w-8 h-8 mb-2" />
            Kreis
          </Button>

          <Button
            data-testid="tools_button_scatter_plot"
            onClick={handleScatterPlot}
            loading={loading}
            disabled={!chartData || !chartTitle}
            variant="secondary"
            className="flex-col h-24"
          >
            <ScatterChart className="w-8 h-8 mb-2" />
            Streuung
          </Button>

          <Button
            data-testid="tools_button_histogram"
            onClick={handleHistogram}
            loading={loading}
            disabled={!chartData || !chartTitle}
            variant="secondary"
            className="flex-col h-24"
          >
            <Activity className="w-8 h-8 mb-2" />
            Histogramm
          </Button>
        </div>
      </Card>

      {/* Quick Templates */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Schnell-Vorlagen</h3>

        <div className="flex gap-2 flex-wrap">
          <Button
            data-testid="tools_button_template_sales"
            onClick={() => {
              setChartTitle('Monatliche Verkäufe');
              setChartData(JSON.stringify([
                { label: 'Jan', value: 1200 },
                { label: 'Feb', value: 1900 },
                { label: 'Mär', value: 1500 },
                { label: 'Apr', value: 2100 },
                { label: 'Mai', value: 1800 }
              ], null, 2));
            }}
            variant="ghost"
            size="sm"
          >
            Verkaufsdaten
          </Button>

          <Button
            data-testid="tools_button_template_distribution"
            onClick={() => {
              setChartTitle('Marktanteile');
              setChartData(JSON.stringify([
                { name: 'Produkt A', value: 40 },
                { name: 'Produkt B', value: 30 },
                { name: 'Produkt C', value: 20 },
                { name: 'Sonstiges', value: 10 }
              ], null, 2));
            }}
            variant="ghost"
            size="sm"
          >
            Marktanteile
          </Button>

          <Button
            data-testid="tools_button_template_scatter"
            onClick={() => {
              setChartTitle('Korrelation Alter/Gehalt');
              setChartData(JSON.stringify([
                { x: 25, y: 35000 },
                { x: 30, y: 45000 },
                { x: 35, y: 55000 },
                { x: 40, y: 65000 },
                { x: 45, y: 70000 }
              ], null, 2));
            }}
            variant="ghost"
            size="sm"
          >
            Korrelation
          </Button>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Ergebnis</h3>
          <pre
            data-testid="tools_result_chart"
            className="p-4 bg-dark-100 dark:bg-dark-800 rounded-lg overflow-auto text-sm max-h-96 font-mono"
          >
            {result}
          </pre>
        </Card>
      )}
    </div>
  );
}

export default ChartTools;
