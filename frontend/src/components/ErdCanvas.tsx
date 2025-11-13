import type { MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  Position,
  getSmoothStepPath,
  type NodeTypes,
  type EdgeTypes,
  type OnNodesChange,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import KeyBindings from './KeyBindings';
import { useRef } from 'react';
import type { Column, ForeignKey, Table, TablePosition } from '../types/model';
import { computeLayout } from '../lib/layout';
import { useModelStore } from '../store/modelStore';
import { useThemeStore } from '../store/themeStore';
import { CrowFootEdge, type CrowFootEdgeType, computeKindsFromModel, computeKindsForEdgeData, normalizeCardinality, type Kind, type CrowFootEdgeData } from './CrowFootEdge';
import { TableNode, type TableNodeType } from './TableNode';
import { buildConstraintName } from '../lib/naming';

const nodeTypes = {
  table: TableNode,
} satisfies NodeTypes;

const edgeTypes = {
  crowFoot: CrowFootEdge,
} satisfies EdgeTypes;

const placeholderPosition = (index: number): { x: number; y: number } => ({
  x: (index % 3) * 280,
  y: Math.floor(index / 3) * 200,
});

const BRAND_COLOR_HEX = '#285d9f';

const computeDiagramBounds = (tables: Table[], padding = 32) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  tables.forEach((table, index) => {
    const width = 256;
    const headerHeight = 44;
    const rowHeight = 44;
    const position = table.position ?? placeholderPosition(index);
    const height = headerHeight + table.columns.length * rowHeight;

    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + width);
    maxY = Math.max(maxY, position.y + height);
  });

  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
};

type HtmlToImageModule = typeof import('html-to-image');

let htmlToImageModule: HtmlToImageModule | null = null;

const ensureHtmlToImage = async (): Promise<HtmlToImageModule> => {
  if (htmlToImageModule) return htmlToImageModule;
  htmlToImageModule = await import('html-to-image');
  return htmlToImageModule;
};

const pxToMm = (px: number) => (px * 25.4) / 96;

type RelationshipInfo = {
  fk: ForeignKey;
  fkId: string;
  constraintName: string;
  sourceTableId: string;
  sourceTableName: string;
  sourceColumnId: string;
  sourceColumnName: string;
  sourceColumnIsUnique: boolean;
  sourceColumnNullable: boolean;
  targetTableId: string;
  targetTableName: string;
  targetColumnId: string;
  targetColumnName: string;
  targetColumnIsUnique: boolean;
  startKind: Kind;
  endKind: Kind;
};

const ErdCanvasInner = () => {
  const model = useModelStore((state) => state.model);
  const selectedTableId = useModelStore((state) => state.selectedTableId);
  const selectedColumnId = useModelStore((state) => state.selectedColumnId);
  const setSelectedTableId = useModelStore((state) => state.setSelectedTableId);
  const setSelectedColumnId = useModelStore((state) => state.setSelectedColumnId);
  const setTablePosition = useModelStore((state) => state.setTablePosition);
  const setTablePositions = useModelStore((state) => state.setTablePositions);
  const updateColumn = useModelStore((state) => state.updateColumn);
  const addColumn = useModelStore((state) => state.addColumn);
  const moveColumn = useModelStore((state) => state.moveColumn);
  const removeColumn = useModelStore((state) => state.removeColumn);
  const addForeignKey = useModelStore((state) => state.addForeignKey);
  const updateForeignKey = useModelStore((state) => state.updateForeignKey);
  const removeForeignKey = useModelStore((state) => state.removeForeignKey);
  const undo = useModelStore((state) => state.undo);
  const themeMode = useThemeStore((state) => state.mode);

  useEffect(() => {
    if (model.tables.length === 0) {
      return;
    }

    const positionsToPatch: Record<string, TablePosition> = {};
    model.tables.forEach((table, index) => {
      const pos = table.position;
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        positionsToPatch[table.id] = placeholderPosition(index);
      }
    });

    if (Object.keys(positionsToPatch).length > 0) {
      setTablePositions(positionsToPatch);
    }
  }, [model.tables, setTablePositions]);

  const schemaById = useMemo(
    () => new Map(model.schemas.map((schema) => [schema.id, schema.name])),
    [model.schemas],
  );

  const tablesById = useMemo(
    () => new Map(model.tables.map((table) => [table.id, table])),
    [model.tables],
  );

  const fkInfoById = useMemo(() => {
    const map = new Map<string, RelationshipInfo>();
    model.tables.forEach((table) => {
      table.foreignKeys.forEach((fk) => {
        const targetTable = tablesById.get(fk.toTableId);
        const fromColumn = table.columns.find(
          (column) => column.id === fk.fromColumnId,
        );
        const toColumn = targetTable?.columns.find(
          (column) => column.id === fk.toColumnId,
        );
        if (!targetTable || !fromColumn || !toColumn) {
          return;
        }

        const inferred = computeKindsFromModel({
          fkNullable: !!fromColumn.nullable,
          fkIsUnique: !!(fromColumn.isPrimaryKey || fromColumn.isUnique),
          refIsUnique: !!(toColumn.isPrimaryKey || toColumn.isUnique),
        });

        const startKind = normalizeCardinality(fk.startCardinality, inferred.start);
        const endKind = normalizeCardinality(fk.endCardinality, inferred.end);

        const sourceSchema = schemaById.get(table.schemaId) ?? 'public';
        const targetSchema = schemaById.get(targetTable.schemaId) ?? 'public';

        map.set(fk.id, {
          fk,
          fkId: fk.id,
          constraintName: fk.name,
          sourceTableId: table.id,
          sourceTableName: `${sourceSchema}.${table.name}`,
          sourceColumnId: fromColumn.id,
          sourceColumnName: fromColumn.name,
          sourceColumnIsUnique: !!(fromColumn.isPrimaryKey || fromColumn.isUnique),
          sourceColumnNullable: !!fromColumn.nullable,
          targetTableId: targetTable.id,
          targetTableName: `${targetSchema}.${targetTable.name}`,
          targetColumnId: toColumn.id,
          targetColumnName: toColumn.name,
          targetColumnIsUnique: !!(toColumn.isPrimaryKey || toColumn.isUnique),
          startKind,
          endKind,
        });
      });
    });
    return map;
  }, [model.tables, tablesById, schemaById]);

  const handleSelectColumn = useCallback(
    (tableId: string, columnId: string) => {
      setSelectedTableId(tableId);
      setSelectedColumnId(columnId);
    },
    [setSelectedColumnId, setSelectedTableId],
  );

  // multiple selection support
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const removeTable = useModelStore((s) => s.removeTable);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<TableNodeType, CrowFootEdgeType> | null>(null);

  useEffect(() => {
    if (!selectedTableId) {
      return;
    }
    if (selectedNodeIds.includes(selectedTableId)) {
      return;
    }
    if (selectedNodeIds.length <= 1) {
      setSelectedNodeIds([selectedTableId]);
    }
  }, [selectedTableId, selectedNodeIds]);

  const selectedEdgeInfo = useMemo(
    () => (selectedEdgeId ? fkInfoById.get(selectedEdgeId) ?? null : null),
    [selectedEdgeId, fkInfoById],
  );

  useEffect(() => {
    if (selectedEdgeId && !fkInfoById.has(selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId, fkInfoById]);

  const handleUpdateColumn = useCallback(
    (tableId: string, columnId: string, patch: Partial<Column>) => {
      updateColumn(tableId, columnId, patch);
    },
    [updateColumn],
  );

  const handleAddColumn = useCallback(
    (tableId: string) => {
      // create column and ensure the table is selected so the properties panel appears
      addColumn(tableId);
      setSelectedTableId(tableId);
    },
    [addColumn, setSelectedTableId],
  );

  const handleRemoveColumn = useCallback(
    (tableId: string, columnId: string) => {
      removeColumn(tableId, columnId);
    },
    [removeColumn],
  );

  const handleReorderColumn = useCallback(
    (tableId: string, columnId: string, targetColumnId: string) => {
      moveColumn(tableId, columnId, targetColumnId);
    },
    [moveColumn],
  );

  const nodes = useMemo<TableNodeType[]>(() => {
    return model.tables.map((table, index) => ({
      id: table.id,
      type: 'table',
      data: {
        table,
        schemaName: schemaById.get(table.schemaId) ?? 'public',
        selectedColumnId,
        foreignKeyColumnIds: table.foreignKeys.map((fk) => fk.fromColumnId),
        onSelectColumn: handleSelectColumn,
        onUpdateColumn: handleUpdateColumn,
        onAddColumn: handleAddColumn,
        onRemoveColumn: handleRemoveColumn,
        onReorderColumn: handleReorderColumn,
      },
      position: table.position ?? placeholderPosition(index),
      draggable: true,
      selectable: true,
      // when multi-selected, mark selected if present in selectedNodeIds
      selected:
        (selectedNodeIds.length > 0 && selectedNodeIds.includes(table.id)) ||
        (selectedNodeIds.length === 0 && table.id === selectedTableId),
    }));
  }, [
    model.tables,
    schemaById,
    selectedTableId,
    selectedColumnId,
    handleSelectColumn,
    handleUpdateColumn,
    handleAddColumn,
    handleRemoveColumn,
    handleReorderColumn,
    selectedNodeIds,
  ]);

  const edges = useMemo<CrowFootEdgeType[]>(() => {
    const list: CrowFootEdgeType[] = [];
    fkInfoById.forEach((info) => {
      const sourceTable = tablesById.get(info.sourceTableId);
      const targetTable = tablesById.get(info.targetTableId);
      let sourceHandle = `source-${info.sourceColumnId}`;
      let targetHandle = `target-${info.targetColumnId}`;

      if (sourceTable?.position && targetTable?.position) {
        if (targetTable.position.x < sourceTable.position.x - 1) {
          sourceHandle = `source-left-${info.sourceColumnId}`;
          targetHandle = `target-right-${info.targetColumnId}`;
        }
      }

      list.push({
        id: info.fkId,
        source: info.sourceTableId,
        target: info.targetTableId,
        type: 'crowFoot',
        animated: false,
        interactionWidth: 20,
        sourceHandle,
        targetHandle,
        data: {
          start: info.startKind,
          end: info.endKind,
          fkId: info.fkId,
        },
        style:
          selectedEdgeId === info.fkId
            ? { stroke: '#2563eb', strokeWidth: 2 }
            : undefined,
      });
    });
    return list;
  }, [fkInfoById, selectedEdgeId, tablesById]);

  const previousNodeCountRef = useRef(0);
  useEffect(() => {
    const instance = reactFlowInstanceRef.current;
    if (!instance) {
      return;
    }

    const count = nodes.length;
    if (count === 0) {
      previousNodeCountRef.current = 0;
      return;
    }

    const shouldRefit =
      previousNodeCountRef.current === 0 || previousNodeCountRef.current !== count;

    previousNodeCountRef.current = count;

    if (!shouldRefit) {
      return;
    }

    requestAnimationFrame(() => {
      instance.fitView({ padding: 0.25, duration: 200 });
    });
  }, [nodes.length]);

  const onNodesChange = useCallback<OnNodesChange<TableNodeType>>(
    (changes) => {
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          setTablePosition(change.id, change.position);
        }
        if (change.type === 'select' && typeof change.selected === 'boolean') {
          // selection change: if multi-select is active (shift click), manage selectedNodeIds
          if (change.selected) {
            // if shift key not pressed, replace selection
            setSelectedNodeIds((prev) => {
              if (prev.length === 0) {
                return [change.id];
              }
              // keep existing selection (multi-select handled on click)
              return prev.includes(change.id) ? prev : [...prev, change.id];
            });
            setSelectedTableId(change.id);
          } else {
            setSelectedNodeIds((prev) => prev.filter((id) => id !== change.id));
            if (selectedTableId === change.id) {
              setSelectedTableId(null);
            }
          }
        }
      });
    },
    [setSelectedTableId, setTablePosition],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: TableNodeType) => {
      setTablePosition(node.id, node.position);
    },
    [setTablePosition],
  );

  const handleNodeClick = useCallback(
    (event: MouseEvent, node: TableNodeType) => {
      const ev = event as MouseEvent & { shiftKey?: boolean };
      if (ev.shiftKey) {
        setSelectedNodeIds((prev) =>
          prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id],
        );
      } else {
        setSelectedNodeIds([node.id]);
      }
      setSelectedTableId(node.id);
      setSelectedEdgeId(null);
    },
    [setSelectedTableId, setSelectedEdgeId],
  );

  const handleEdgeClick = useCallback(
    (event: MouseEvent, edge: Edge) => {
      event.stopPropagation?.();
      const metaId =
        edge.id ??
        ((edge.data as Partial<CrowFootEdgeData> | undefined)?.fkId ?? '');
      const info = fkInfoById.get(metaId);
      if (!info) {
        return;
      }
      setSelectedEdgeId(info.fkId);
      setSelectedTableId(info.sourceTableId);
      setSelectedColumnId(info.sourceColumnId);
    },
    [fkInfoById, setSelectedEdgeId, setSelectedTableId, setSelectedColumnId],
  );

  // Keep FK cardinalities in sync with inferred defaults only when absent and reset
  useEffect(() => {
    model.tables.forEach((table) => {
      table.foreignKeys.forEach((fk) => {
        if (fk.startCardinality != null && fk.endCardinality != null) {
          return;
        }

        const inferred = computeKindsForEdgeData(
          {
            sourceTableId: table.id,
            sourceColumnId: fk.fromColumnId,
            targetTableId: fk.toTableId,
            targetColumnId: fk.toColumnId,
          },
          model,
        );

        const patch: Partial<ForeignKey> = {};
        if (fk.startCardinality == null) {
          patch.startCardinality = inferred.start;
        }
        if (fk.endCardinality == null) {
          patch.endCardinality = inferred.end;
        }

        if (Object.keys(patch).length > 0) {
          updateForeignKey(table.id, fk.id, patch);
        }
      });
    });
  }, [model.tables, model, updateForeignKey]);

    // Ensure created connections always use FK -> referenced direction.
    const onConnect = useCallback(
      (connection: any) => {
        const { source, sourceHandle, target, targetHandle } = connection;
        if (!source || !target || !sourceHandle || !targetHandle) return;

        const parseHandle = (h: string) => {
          const parts = String(h).split('-');
          const segments = parts.slice(1).filter((segment) => segment !== 'left' && segment !== 'right');
          return segments.join('-');
        };

        const srcHandleCol = parseHandle(sourceHandle);
        const tgtHandleCol = parseHandle(targetHandle);

        // assume source node is FK owner
        let fkTableId = source;
        let fkColId = srcHandleCol;
        let refTableId = target;
        let refColId = tgtHandleCol;

        const srcTable = tablesById.get(source);
        const tgtTable = tablesById.get(target);

        const srcHasSrcCol = !!srcTable?.columns.some((c) => c.id === srcHandleCol);
        const tgtHasTgtCol = !!tgtTable?.columns.some((c) => c.id === tgtHandleCol);

        if (!srcHasSrcCol || !tgtHasTgtCol) {
          // maybe reversed; try swap
          const srcHasTgtCol = !!srcTable?.columns.some((c) => c.id === tgtHandleCol);
          const tgtHasSrcCol = !!tgtTable?.columns.some((c) => c.id === srcHandleCol);
          if (srcHasTgtCol && tgtHasSrcCol) {
            fkTableId = target;
            fkColId = tgtHandleCol;
            refTableId = source;
            refColId = srcHandleCol;
          } else {
            return;
          }
        }

        const fkTable = tablesById.get(fkTableId);
        const refTable = tablesById.get(refTableId);
        const fkCol = fkTable?.columns.find((c) => c.id === fkColId);
        const refCol = refTable?.columns.find((c) => c.id === refColId);
        if (!fkCol || !refCol) return;

        const fkNullable = !!fkCol.nullable;
        const refIsUnique = !!(refCol.isPrimaryKey || refCol.isUnique);
        const { start, end } = computeKindsFromModel({
          fkNullable,
          fkIsUnique: !!(fkCol.isPrimaryKey || fkCol.isUnique),
          refIsUnique,
        });

        const fk = {
          name: buildConstraintName(
            [fkTable?.name, fkCol?.name, 'fk'],
            `fk_${fkColId.slice(0, 8)}`,
          ),
          fromColumnId: fkColId,
          toTableId: refTableId,
          toColumnId: refColId,
          startCardinality: start,
          endCardinality: end,
        };

        addForeignKey(fkTableId, fk as any);
      },
      [tablesById, addForeignKey],
    );

  const handlePaneClick = useCallback(() => {
    setSelectedColumnId(null);
    setSelectedEdgeId(null);
  }, [setSelectedColumnId, setSelectedEdgeId]);

  const [isLayouting, setIsLayouting] = useState(false);
  const handleAutoLayout = useCallback(async () => {
    setIsLayouting(true);
    try {
      const positions = await computeLayout(model);
      setTablePositions(positions);
    } finally {
      setIsLayouting(false);
    }
  }, [model, setTablePositions]);

  useEffect(() => {
    const needsLayout = model.tables.some((table) => !table.position);
    if (needsLayout && model.tables.length > 0) {
      void handleAutoLayout();
    }
  }, [model.tables, handleAutoLayout]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadScript = (src: string) =>
    new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });

  const exportAsImage = async (type: 'png' | 'svg' | 'pdf') => {
    const wrapper = containerRef.current;
    if (!wrapper) return;
    const flowEl = wrapper.querySelector('.react-flow') as HTMLElement | null;
    if (!flowEl) return;

    const bounds = computeDiagramBounds(model.tables);

    const buildTablesSnapshot = () => {
      if (model.tables.length === 0) return null;

      const padding = 48;
      const exportBounds = computeDiagramBounds(model.tables, padding);
      const width = Math.max(1, Math.ceil(exportBounds.width));
      const height = Math.max(1, Math.ceil(exportBounds.height));
      const zoom = reactFlowInstanceRef.current?.getZoom?.() ?? 1;

      const tableInfo = new Map(
        model.tables.map((table, index) => [table.id, { table, index }]),
      );

      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.position = 'fixed';
      host.style.left = '-100000px';
      host.style.top = '0';
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
      host.style.pointerEvents = 'none';
      host.style.opacity = '0';
      host.style.zIndex = '-1';
      host.style.background = 'transparent';

      const canvas = document.createElement('div');
      canvas.style.position = 'relative';
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.backgroundColor = '#ffffff';
      canvas.style.boxSizing = 'border-box';
      canvas.style.fontFamily = `Inter, 'Helvetica Neue', Arial, sans-serif`;
      canvas.style.padding = '0';

      host.appendChild(canvas);
      document.body.appendChild(host);

      const anchorPositions = new Map<
        string,
        Map<string, { source?: { x: number; y: number }; target?: { x: number; y: number } }>
      >();
      const tableSizes = new Map<string, { width: number; height: number }>();
      const svgNS = 'http://www.w3.org/2000/svg';

      const nodeElements = flowEl.querySelectorAll<HTMLElement>('.react-flow__node');

      nodeElements.forEach((nodeEl) => {
        const id = nodeEl.dataset.id ?? nodeEl.getAttribute('data-id');
        if (!id) return;
        const info = tableInfo.get(id);
        if (!info) return;
        const { table, index } = info;
        const pos = table.position ?? placeholderPosition(index);

        const nodeRect = nodeEl.getBoundingClientRect();
        const measuredWidth = nodeRect.width / zoom;
        const measuredHeight = nodeRect.height / zoom;
        tableSizes.set(table.id, { width: measuredWidth, height: measuredHeight });

        const handleEls = nodeEl.querySelectorAll<HTMLElement>('.react-flow__handle');
        handleEls.forEach((handleEl) => {
          const rawId =
            handleEl.dataset.handleid ??
            handleEl.getAttribute('data-handleid') ??
            handleEl.id ??
            '';
          if (!rawId) return;
          const [handleType, ...rest] = rawId.split('-');
          if (rest.length === 0) return;
          const columnId = rest.join('-');
          const handleRect = handleEl.getBoundingClientRect();
          const offsetX = (handleRect.left - nodeRect.left + handleRect.width / 2) / zoom;
          const offsetY = (handleRect.top - nodeRect.top + handleRect.height / 2) / zoom;
          const absX = pos.x - exportBounds.minX + offsetX;
          const absY = pos.y - exportBounds.minY + offsetY;
          const columnMap =
            anchorPositions.get(table.id) ??
            new Map<string, { source?: { x: number; y: number }; target?: { x: number; y: number } }>();
          const entry = columnMap.get(columnId) ?? {};
          if (handleType === 'source' || handleType === 'target') {
            entry[handleType] = { x: absX, y: absY };
          }
          columnMap.set(columnId, entry);
          anchorPositions.set(table.id, columnMap);
        });

        const clone = nodeEl.cloneNode(true) as HTMLElement;
        clone.classList.remove('selected');
        clone.style.position = 'absolute';
        clone.style.transform = 'none';
        clone.style.left = `${Math.round(pos.x - exportBounds.minX)}px`;
        clone.style.top = `${Math.round(pos.y - exportBounds.minY)}px`;
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none';
        const computed = getComputedStyle(nodeEl);
        clone.style.boxShadow = computed.boxShadow || '0 18px 50px rgba(15, 23, 42, 0.08)';
        clone.style.borderColor = computed.borderColor || 'rgba(148, 163, 184, 0.65)';
        clone.style.borderWidth = computed.borderWidth || '1px';
        clone.style.borderStyle = computed.borderStyle || 'solid';
        clone.style.backgroundColor = computed.backgroundColor || '#ffffff';
        clone.style.minWidth = `${measuredWidth}px`;
        clone.style.maxWidth = clone.style.minWidth;
        const radius = computed.borderRadius;
        if (radius && radius !== '0px') {
          clone.style.borderRadius = radius;
        }
        clone.dataset.exportKind = 'table';
        clone.dataset.exportWidth = String(measuredWidth);
        clone.dataset.exportHeight = String(measuredHeight);

        clone.querySelectorAll('.react-flow__handle').forEach((handle) => {
          (handle as HTMLElement).style.display = 'none';
        });

        canvas.appendChild(clone);
      });

      if (canvas.childElementCount === 0) {
        host.remove();
        return null;
      }

      const edgesSvg = document.createElementNS(svgNS, 'svg');
      edgesSvg.setAttribute('xmlns', svgNS);
      edgesSvg.setAttribute('width', `${width}`);
      edgesSvg.setAttribute('height', `${height}`);
      edgesSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      edgesSvg.style.position = 'absolute';
      edgesSvg.style.left = '0';
      edgesSvg.style.top = '0';
      edgesSvg.style.pointerEvents = 'none';
      edgesSvg.style.overflow = 'visible';

      const defs = document.createElementNS(svgNS, 'defs');
      const markerMany = document.createElementNS(svgNS, 'marker');
      markerMany.setAttribute('id', 'cf_marker_many');
      markerMany.setAttribute('markerWidth', '14');
      markerMany.setAttribute('markerHeight', '14');
      markerMany.setAttribute('refX', '12');
      markerMany.setAttribute('refY', '7');
      markerMany.setAttribute('orient', 'auto');
      markerMany.setAttribute('markerUnits', 'strokeWidth');
      const markerManyPath = document.createElementNS(svgNS, 'path');
      markerManyPath.setAttribute('d', 'M0,0 L12,7 L0,14 M0,7 L12,7');
      markerManyPath.setAttribute('fill', 'none');
      markerManyPath.setAttribute('stroke', BRAND_COLOR_HEX);
      markerManyPath.setAttribute('stroke-width', '1.6');
      markerManyPath.setAttribute('stroke-linecap', 'round');
      markerManyPath.setAttribute('stroke-linejoin', 'round');
      markerMany.appendChild(markerManyPath);
      defs.appendChild(markerMany);

      const markerOne = document.createElementNS(svgNS, 'marker');
      markerOne.setAttribute('id', 'cf_marker_one');
      markerOne.setAttribute('markerWidth', '6');
      markerOne.setAttribute('markerHeight', '14');
      markerOne.setAttribute('refX', '6');
      markerOne.setAttribute('refY', '7');
      markerOne.setAttribute('orient', 'auto');
      markerOne.setAttribute('markerUnits', 'strokeWidth');
      const markerOnePath = document.createElementNS(svgNS, 'path');
      markerOnePath.setAttribute('d', 'M6,0 L6,14');
      markerOnePath.setAttribute('stroke', BRAND_COLOR_HEX);
      markerOnePath.setAttribute('stroke-width', '1.6');
      markerOnePath.setAttribute('stroke-linecap', 'round');
      markerOnePath.setAttribute('fill', 'none');
      markerOne.appendChild(markerOnePath);
      defs.appendChild(markerOne);

      edgesSvg.appendChild(defs);
      const edgesGroup = document.createElementNS(svgNS, 'g');
      edgesSvg.appendChild(edgesGroup);

      const tablesById = new Map(model.tables.map((t) => [t.id, t]));

      const getAnchor = (
        tableId: string,
        columnId: string,
        kind: 'source' | 'target',
        fallback: { x: number; y: number },
      ) => {
        const map = anchorPositions.get(tableId);
        const entry = map?.get(columnId);
        const anchor = entry?.[kind];
        if (anchor) {
          return anchor;
        }
        return fallback;
      };

      const defaultHeaderHeight = 56;
      const defaultRowHeight = 56;

      const adjustAnchor = (
        point: { x: number; y: number },
        kind: 'source' | 'target',
      ) => {
        const offset = kind === 'source' ? 16 : -16;
        return { x: point.x + offset, y: point.y };
      };

      model.tables.forEach((sourceTable) => {
        sourceTable.foreignKeys.forEach((fk) => {
          const targetTable = tablesById.get(fk.toTableId);
          if (!targetTable) return;

          const sourceIndex = sourceTable.columns.findIndex((c) => c.id === fk.fromColumnId);
          const targetIndex = targetTable.columns.findIndex((c) => c.id === fk.toColumnId);
          if (sourceIndex === -1 || targetIndex === -1) return;

          const sourceInfo = tableInfo.get(sourceTable.id);
          const targetInfo = tableInfo.get(targetTable.id);
          if (!sourceInfo || !targetInfo) return;

          const sourcePos = sourceTable.position ?? placeholderPosition(sourceInfo.index);
          const targetPos = targetTable.position ?? placeholderPosition(targetInfo.index);

          const sourceSize = tableSizes.get(sourceTable.id) ?? { width: 256, height: defaultHeaderHeight + sourceTable.columns.length * defaultRowHeight };

          const sourceFallback = {
            x: sourcePos.x - exportBounds.minX + sourceSize.width,
            y:
              sourcePos.y -
              exportBounds.minY +
              defaultHeaderHeight +
              sourceIndex * defaultRowHeight +
              defaultRowHeight / 2,
          };
          const targetFallback = {
            x: targetPos.x - exportBounds.minX,
            y:
              targetPos.y -
              exportBounds.minY +
              defaultHeaderHeight +
              targetIndex * defaultRowHeight +
              defaultRowHeight / 2,
          };

          const sourcePoint = adjustAnchor(
            getAnchor(sourceTable.id, fk.fromColumnId, 'source', sourceFallback),
            'source',
          );
          const targetPoint = adjustAnchor(
            getAnchor(targetTable.id, fk.toColumnId, 'target', targetFallback),
            'target',
          );

          const [edgePath] = getSmoothStepPath({
            sourceX: sourcePoint.x,
            sourceY: sourcePoint.y,
            targetX: targetPoint.x,
            targetY: targetPoint.y,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });

          const fromColumn = sourceTable.columns[sourceIndex];
          const toColumn = targetTable.columns[targetIndex];
          const inferred = computeKindsFromModel({
            fkNullable: !!fromColumn.nullable,
            fkIsUnique: !!(fromColumn.isPrimaryKey || fromColumn.isUnique),
            refIsUnique: !!(toColumn.isPrimaryKey || toColumn.isUnique),
          });
          const startKind = normalizeCardinality(fk.startCardinality, inferred.start);
          const endKind = normalizeCardinality(fk.endCardinality, inferred.end);

          const pathEl = document.createElementNS(svgNS, 'path');
          pathEl.setAttribute('d', edgePath);
          pathEl.setAttribute('fill', 'none');
          pathEl.setAttribute('stroke', BRAND_COLOR_HEX);
          pathEl.setAttribute('stroke-width', '1.6');
          pathEl.setAttribute(
            'marker-start',
            `url(#${startKind === 'many' ? 'cf_marker_many' : 'cf_marker_one'})`,
          );
          pathEl.setAttribute(
            'marker-end',
            `url(#${endKind === 'many' ? 'cf_marker_many' : 'cf_marker_one'})`,
          );
          edgesGroup.appendChild(pathEl);
        });
      });

      if (edgesGroup.childElementCount > 0) {
        canvas.insertBefore(edgesSvg, canvas.firstChild);
      }

      const contentBounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      };

      const registerBounds = (x: number, y: number, w: number, h: number) => {
        contentBounds.minX = Math.min(contentBounds.minX, x);
        contentBounds.minY = Math.min(contentBounds.minY, y);
        contentBounds.maxX = Math.max(contentBounds.maxX, x + w);
        contentBounds.maxY = Math.max(contentBounds.maxY, y + h);
      };

      canvas.querySelectorAll<HTMLElement>('[data-export-kind="table"]').forEach((tableEl) => {
        const left = parseFloat(tableEl.style.left || '0');
        const top = parseFloat(tableEl.style.top || '0');
        const w = parseFloat(tableEl.dataset.exportWidth || `${tableEl.offsetWidth || 0}`);
        const h = parseFloat(tableEl.dataset.exportHeight || `${tableEl.offsetHeight || 0}`);
        registerBounds(left, top, w, h);
      });

      if (edgesGroup.childElementCount > 0) {
        const edgesBox = edgesGroup.getBBox();
        registerBounds(edgesBox.x, edgesBox.y, edgesBox.width, edgesBox.height);
      }

      let finalWidth = width;
      let finalHeight = height;
      if (
        Number.isFinite(contentBounds.minX) &&
        Number.isFinite(contentBounds.minY) &&
        Number.isFinite(contentBounds.maxX) &&
        Number.isFinite(contentBounds.maxY)
      ) {
        const finalPadding = 48;
        const offsetX = finalPadding - contentBounds.minX;
        const offsetY = finalPadding - contentBounds.minY;
        const normalizedWidth = Math.ceil(
          (contentBounds.maxX - contentBounds.minX) + finalPadding * 2,
        );
        const normalizedHeight = Math.ceil(
          (contentBounds.maxY - contentBounds.minY) + finalPadding * 2,
        );

        canvas.querySelectorAll<HTMLElement>('[data-export-kind="table"]').forEach((tableEl) => {
          const left = parseFloat(tableEl.style.left || '0');
          const top = parseFloat(tableEl.style.top || '0');
          tableEl.style.left = `${left + offsetX}px`;
          tableEl.style.top = `${top + offsetY}px`;
        });

        if (edgesGroup.childElementCount > 0) {
          const existingTransform = edgesGroup.getAttribute('transform');
          const translate = `translate(${offsetX},${offsetY})`;
          edgesGroup.setAttribute(
            'transform',
            existingTransform ? `${existingTransform} ${translate}` : translate,
          );
        }

        finalWidth = normalizedWidth;
        finalHeight = normalizedHeight;
        canvas.style.width = `${normalizedWidth}px`;
        canvas.style.height = `${normalizedHeight}px`;
        host.style.width = `${normalizedWidth}px`;
        host.style.height = `${normalizedHeight}px`;
        edgesSvg.setAttribute('width', `${normalizedWidth}`);
        edgesSvg.setAttribute('height', `${normalizedHeight}`);
        edgesSvg.setAttribute('viewBox', `0 0 ${normalizedWidth} ${normalizedHeight}`);
      }

      return { host, canvas, width: finalWidth, height: finalHeight };
    };

    if (type === 'svg' || type === 'pdf') {
      const snapshot = buildTablesSnapshot();
      if (!snapshot) {
        alert('Não foi possível preparar a exportação.');
        return;
      }

      const { host, canvas, width, height } = snapshot;
      try {
        const htmlToImage = await ensureHtmlToImage();

        if (type === 'svg') {
          const svgDataUrl = await htmlToImage.toSvg(canvas, {
            backgroundColor: '#ffffff',
            width,
            height,
            skipAutoScale: true,
            style: {
              transform: 'none',
            },
          });
          const response = await fetch(svgDataUrl);
          if (!response.ok) {
            throw new Error('Falha ao processar SVG');
          }
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = 'diagrama.svg';
          a.click();
          URL.revokeObjectURL(objectUrl);
          return;
        }

        const pixelRatio = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
        const pngDataUrl = await htmlToImage.toPng(canvas, {
          backgroundColor: '#ffffff',
          width,
          height,
          pixelRatio,
          skipAutoScale: true,
          style: {
            transform: 'none',
          },
        });

        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = async () => {
            try {
              if (!(window as any).jspdf) {
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
              }
              const jsPDF =
                (window as any).jspdf?.jsPDF ||
                (window as any).JSFP ||
                (window as any).jsPDF ||
                null;
              if (!jsPDF) throw new Error('jsPDF não disponível');

              const orientation = img.width >= img.height ? 'l' : 'p';
              const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
              const pageWidth = pdf.internal.pageSize.getWidth();
              const pageHeight = pdf.internal.pageSize.getHeight();
              const margin = 12;
              const innerW = pageWidth - margin * 2;
              const innerH = pageHeight - margin * 2;
              const imgWmm = pxToMm(img.width);
              const imgHmm = pxToMm(img.height);
              const scale = Math.min(innerW / imgWmm, innerH / imgHmm);
              const drawW = imgWmm * scale;
              const drawH = imgHmm * scale;
              const left = (pageWidth - drawW) / 2;
              const top = (pageHeight - drawH) / 2;

              pdf.addImage(pngDataUrl, 'PNG', left, top, drawW, drawH, undefined, 'FAST');
              pdf.save('diagrama.pdf');
              resolve();
            } catch (error) {
              reject(error);
            }
          };
          img.onerror = () => reject(new Error('Erro ao carregar imagem gerada'));
          img.src = pngDataUrl;
        });
        return;
      } catch (err) {
        console.error('failed to export diagrama', err);
        alert('Erro ao exportar diagrama.');
        return;
      } finally {
        host.remove();
      }
    }

    const fitAndRestore = async () => {
      const instance = reactFlowInstanceRef.current;
      if (!instance) {
        return () => {};
      }
      const viewport = instance.getViewport?.();
      instance.fitBounds?.(
        { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height },
        { padding: 0.05 },
      );
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      return () => {
        if (viewport) {
          instance.setViewport?.(viewport);
        }
      };
    };

    // fallback: raster PNG via html2canvas
    try {
      // html2canvas for raster capture
      // @ts-ignore
      if (!window.html2canvas) {
        // using CDN
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      }
    } catch (e) {
      console.error('failed to load html2canvas', e);
    }

    const restoreViewport = await fitAndRestore();

    try {
      // use html2canvas to rasterize the flow container
      // @ts-ignore
      const html2canvas = window.html2canvas as typeof import('html2canvas') | undefined;
      if (!html2canvas) {
        alert('Não foi possível carregar html2canvas para a exportação.');
        return;
      }

      const canvas = await html2canvas(flowEl, {
        backgroundColor: themeMode === 'dark' ? '#0f172a' : '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: flowEl.clientWidth,
        height: flowEl.clientHeight,
      });

      if (type === 'png') {
        canvas.toBlob((blob: Blob | null) => {
          if (!blob) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'diagrama.png';
          a.click();
          URL.revokeObjectURL(a.href);
        });
      }
    } finally {
      restoreViewport();
    }
  };

  return (
    <div ref={containerRef} className="relative h-full w-full bg-white transition-colors dark:bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeDragStop={handleNodeDragStop}
        onEdgeClick={handleEdgeClick}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onConnect={onConnect}
        onInit={(instance) => {
          reactFlowInstanceRef.current = instance;
          try {
            // expose instance for Sidebar to compute center projection
            (window as any).__reactFlowInstance = instance;
          } catch (e) {
            // ignore
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background color={themeMode === 'dark' ? '#334155' : '#e2e8f0'} gap={24} />
        <Controls className="bg-white/95 !shadow dark:!bg-slate-900/80" />
      </ReactFlow>
      {/* keyboard shortcuts: select all (Ctrl/Cmd+A) and delete */}
      <KeyBindings
        allNodeIds={model.tables.map((t) => t.id)}
        selectedNodeIds={selectedNodeIds}
        setSelectedNodeIds={setSelectedNodeIds}
        removeTable={removeTable}
        selectedTableId={selectedTableId}
        selectedColumnId={selectedColumnId}
        removeColumn={removeColumn}
        selectedEdge={
          selectedEdgeInfo
            ? { tableId: selectedEdgeInfo.sourceTableId, fkId: selectedEdgeInfo.fkId }
            : null
        }
        removeForeignKey={removeForeignKey}
        undo={undo}
      />
      {selectedEdgeInfo && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <div className="pointer-events-auto flex items-start gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Relacionamento
              </p>
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {selectedEdgeInfo.sourceTableName}.{selectedEdgeInfo.sourceColumnName}
                {' '}
                →
                {' '}
                {selectedEdgeInfo.targetTableName}.{selectedEdgeInfo.targetColumnName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cardinalidade: {selectedEdgeInfo.startKind === 'many' ? 'Muitos' : 'Um'} → {selectedEdgeInfo.endKind === 'many' ? 'Muitos' : 'Um'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Constraint: {selectedEdgeInfo.constraintName}</p>
            </div>
            <button
              type="button"
              className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
              onClick={() => setSelectedEdgeId(null)}
            >
              <i className="bi bi-x" aria-hidden="true" />
              <span className="sr-only">Fechar detalhes do relacionamento</span>
            </button>
          </div>
        </div>
      )}
      <div className="absolute right-3 top-3 flex gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-brand-400 dark:hover:bg-slate-800"
          onClick={handleAutoLayout}
          disabled={isLayouting || model.tables.length === 0}
        >
          {isLayouting ? 'Organizando...' : 'Auto layout'}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-brand-400 dark:hover:bg-slate-800"
          onClick={() => void exportAsImage('svg')}
          disabled={model.tables.length === 0}
        >
          Exportar SVG
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-brand-400 dark:hover:bg-slate-800"
          onClick={() => void exportAsImage('pdf')}
          disabled={model.tables.length === 0}
        >
          Exportar PDF
        </button>
      </div>
    </div>
  );
};

export const ErdCanvas = () => (
  <ReactFlowProvider>
    <ErdCanvasInner />
  </ReactFlowProvider>
);
