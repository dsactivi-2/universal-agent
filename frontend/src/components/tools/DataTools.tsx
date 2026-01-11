'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { Database, FileJson, Table, Play, List, Calculator } from 'lucide-react';

export function DataTools() {
  const [csvData, setCsvData] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState('');
  const [aggregateTable, setAggregateTable] = useState('');
  const [aggregateOp, setAggregateOp] = useState('SUM');
  const [aggregateColumn, setAggregateColumn] = useState('');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleParseCsv = async () => {
    if (!csvData) return;
    setLoading(true);
    try {
      const res = await api.parseCsv(csvData);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleParseJson = async () => {
    if (!jsonData) return;
    setLoading(true);
    try {
      const res = await api.parseJson(jsonData);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleSqlQuery = async () => {
    if (!sqlQuery) return;
    setLoading(true);
    try {
      const res = await api.sqlQuery(sqlQuery);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleCreateTable = async () => {
    if (!tableName || !columns) return;
    setLoading(true);
    try {
      const cols = columns.split(',').map(c => c.trim());
      const res = await api.createTempTable(tableName, cols);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleListTables = async () => {
    setLoading(true);
    try {
      const res = await api.listTables();
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleAggregate = async () => {
    if (!aggregateTable || !aggregateColumn) return;
    setLoading(true);
    try {
      const res = await api.aggregateData(aggregateTable, aggregateOp, aggregateColumn);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* CSV Parser */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Table className="w-5 h-5" />
          CSV Parser
        </h3>

        <div className="space-y-4">
          <textarea
            data-testid="tools_textarea_csv"
            className="w-full h-32 p-3 font-mono text-sm border rounded-lg bg-white dark:bg-dark-800 border-dark-200 dark:border-dark-700 text-dark-900 dark:text-white"
            placeholder="name,age,city&#10;Max,25,Berlin&#10;Anna,30,München"
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
          />

          <Button
            data-testid="tools_button_parse_csv"
            onClick={handleParseCsv}
            loading={loading}
            disabled={!csvData}
            variant="secondary"
          >
            <Table className="w-4 h-4 mr-2" />
            CSV parsen
          </Button>
        </div>
      </Card>

      {/* JSON Parser */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileJson className="w-5 h-5" />
          JSON Parser
        </h3>

        <div className="space-y-4">
          <textarea
            data-testid="tools_textarea_json"
            className="w-full h-32 p-3 font-mono text-sm border rounded-lg bg-white dark:bg-dark-800 border-dark-200 dark:border-dark-700 text-dark-900 dark:text-white"
            placeholder='{"name": "Max", "age": 25}'
            value={jsonData}
            onChange={(e) => setJsonData(e.target.value)}
          />

          <Button
            data-testid="tools_button_parse_json"
            onClick={handleParseJson}
            loading={loading}
            disabled={!jsonData}
            variant="secondary"
          >
            <FileJson className="w-4 h-4 mr-2" />
            JSON parsen
          </Button>
        </div>
      </Card>

      {/* SQL Query */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Database className="w-5 h-5" />
          SQL Abfragen
        </h3>

        <div className="space-y-4">
          <textarea
            data-testid="tools_textarea_sql"
            className="w-full h-24 p-3 font-mono text-sm border rounded-lg bg-white dark:bg-dark-800 border-dark-200 dark:border-dark-700 text-dark-900 dark:text-white"
            placeholder="SELECT * FROM users WHERE age > 21"
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
          />

          <div className="flex gap-2">
            <Button
              data-testid="tools_button_sql_run"
              onClick={handleSqlQuery}
              loading={loading}
              disabled={!sqlQuery}
            >
              <Play className="w-4 h-4 mr-2" />
              Query ausführen
            </Button>
            <Button
              data-testid="tools_button_list_tables"
              onClick={handleListTables}
              loading={loading}
              variant="secondary"
            >
              <List className="w-4 h-4 mr-2" />
              Tabellen auflisten
            </Button>
          </div>
        </div>
      </Card>

      {/* Create Table */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Table className="w-5 h-5" />
          Temporäre Tabelle erstellen
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              data-testid="tools_input_table_name"
              placeholder="Tabellenname"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
            <Input
              data-testid="tools_input_columns"
              placeholder="Spalten (kommagetrennt)"
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
            />
          </div>

          <Button
            data-testid="tools_button_create_table"
            onClick={handleCreateTable}
            loading={loading}
            disabled={!tableName || !columns}
            variant="secondary"
          >
            <Table className="w-4 h-4 mr-2" />
            Tabelle erstellen
          </Button>
        </div>
      </Card>

      {/* Aggregate */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Aggregation
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Input
              data-testid="tools_input_agg_table"
              placeholder="Tabelle"
              value={aggregateTable}
              onChange={(e) => setAggregateTable(e.target.value)}
            />
            <select
              data-testid="tools_select_agg_op"
              className="px-3 py-2 border rounded-lg bg-white dark:bg-dark-800 border-dark-200 dark:border-dark-700 text-dark-900 dark:text-white"
              value={aggregateOp}
              onChange={(e) => setAggregateOp(e.target.value)}
            >
              <option value="SUM">SUM</option>
              <option value="AVG">AVG</option>
              <option value="COUNT">COUNT</option>
              <option value="MIN">MIN</option>
              <option value="MAX">MAX</option>
            </select>
            <Input
              data-testid="tools_input_agg_column"
              placeholder="Spalte"
              value={aggregateColumn}
              onChange={(e) => setAggregateColumn(e.target.value)}
            />
          </div>

          <Button
            data-testid="tools_button_aggregate"
            onClick={handleAggregate}
            loading={loading}
            disabled={!aggregateTable || !aggregateColumn}
            variant="secondary"
          >
            <Calculator className="w-4 h-4 mr-2" />
            Berechnen
          </Button>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Ergebnis</h3>
          <pre
            data-testid="tools_result_data"
            className="p-4 bg-dark-100 dark:bg-dark-800 rounded-lg overflow-auto text-sm max-h-96 font-mono"
          >
            {result}
          </pre>
        </Card>
      )}
    </div>
  );
}

export default DataTools;
