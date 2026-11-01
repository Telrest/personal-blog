import { useEffect, useMemo, useRef, useState } from 'react'
import { ExhibitWorkspace } from '../../components/ExhibitWorkspace'
import { SegmentedControl } from '../../components/controls/SegmentedControl'
import { createStore } from '../../lib/store'
import { useStoreValue } from '../../lib/useStore'
import { ChartPanel } from './charts'
import { SAMPLE_COURSES, SAMPLE_NOTE, VIEW_INFO, VIEW_ORDER } from './content'
import { CourseEditor } from './CourseEditor'
import { GpaGuide } from './GuidePanel'
import { computeGpa, fmtNumber, fmtPercent, BUAA_RULE, type CourseRecord } from './model'
import { GpaRuleSection, GpaSidePanel, GpaSummary } from './panels'
import {
  clearState,
  cloneCourses,
  createCourse,
  loadState,
  parseImport,
  saveState,
  serialize,
  type GpaState,
} from './storage'
import type { GpaView } from './content'
import type { ExhibitModuleProps } from '../types'

type Notice = { tone: 'error' | 'info'; text: string }

export default function GpaExhibit({ mode, onModeChange }: ExhibitModuleProps) {
  const [initial] = useState(() => loadState(SAMPLE_COURSES))
  const [store] = useState(() => createStore<GpaState>(initial.state))
  const state = useStoreValue(store)

  const [view, setView] = useState<GpaView>('contribution')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(
    initial.error ? { tone: 'error', text: initial.error } : null,
  )
  const firstRender = useRef(true)

  const result = useMemo(() => computeGpa(state.courses, BUAA_RULE), [state.courses])
  const selected = result.courses.find((course) => course.id === selectedId) ?? null

  // 第一次渲染不写盘：否则一进来就把示例数据当成用户数据存下去
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setSaved(saveState(state))
  }, [state])

  const mutate = (next: (courses: CourseRecord[]) => CourseRecord[]) => {
    store.set((prev) => ({ courses: next(prev.courses), sample: false }))
  }

  /* ---------------- 课程操作 ---------------- */

  const addCourse = () => {
    mutate((courses) => [...courses, createCourse({ name: `课程 ${courses.length + 1}` })])
  }

  const removeCourse = (id: string) => {
    if (selectedId === id) setSelectedId(null)
    mutate((courses) => courses.filter((course) => course.id !== id))
  }

  const changeCourse = (id: string, patch: Partial<CourseRecord>) => {
    mutate((courses) => courses.map((course) => (course.id === id ? { ...course, ...patch } : course)))
  }

  const resetTargets = () => {
    mutate((courses) => courses.map((course) => ({ ...course, targetText: '' })))
    setNotice({ tone: 'info', text: '已把所有「假设成绩」清空，回到原始成绩。' })
  }

  const loadSample = () => {
    if (!state.sample && state.courses.length > 0) {
      const ok = window.confirm('加载示例会替换当前列表。已经保存的课程会被覆盖，确定吗？\n（可以先导出 JSON 备份。）')
      if (!ok) return
    }
    store.set({ courses: cloneCourses(SAMPLE_COURSES), sample: true })
    setSelectedId(null)
    setNotice({ tone: 'info', text: '已载入示例数据。直接修改任意一格就变成你自己的课程。' })
  }

  const clearAll = () => {
    if (state.courses.length === 0) return
    const ok = window.confirm('清空列表会删除当前所有课程（本机保存的也会一起清掉），确定吗？')
    if (!ok) return
    store.set({ courses: [], sample: false })
    clearState()
    setSelectedId(null)
    setNotice({ tone: 'info', text: '列表已清空。可以新增课程，或重新加载示例。' })
  }

  const exportJson = () => {
    const text = serialize(state)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `gpa-courses-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'info', text: '已导出 JSON 文件（只包含课程名、学分、成绩与参与状态）。' })
  }

  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      const imported = parseImport(text)
      if (!imported.ok) {
        setNotice({ tone: 'error', text: `导入失败，原数据保持不变：${imported.error}` })
        return
      }
      store.set(imported.state)
      setSelectedId(null)
      setNotice({
        tone: 'info',
        text: `已导入 ${imported.state.courses.length} 门课程，当前列表已替换。`,
      })
    } catch {
      setNotice({ tone: 'error', text: '读取文件失败，原数据保持不变。' })
    }
  }

  /* ---------------- 导览 ---------------- */

  if (mode === 'guide') {
    return (
      <>
        <GpaGuide onExit={() => onModeChange?.('free')} />
        <GpaRuleSection rule={BUAA_RULE} />
      </>
    )
  }

  /* ---------------- 自由探索 ---------------- */

  const statusOf = (id: string) => {
    const course = result.courses.find((item) => item.id === id)
    if (!course) return { label: '—', tone: 'warn' as const }
    if (!course.usable) return { label: course.reason ?? '不参与计算', tone: 'warn' as const }
    return {
      label: `绩点 ${fmtNumber(course.gradePoint)}`,
      tone: 'ok' as const,
      detail: `权重 ${fmtPercent(course.weight, 1)} · 贡献 ${fmtNumber(course.contribution)} 绩点`,
    }
  }

  return (
    <>
      <GpaSummary
        result={result}
        sample={state.sample}
        saved={saved}
        restored={!state.sample}
      />

      {state.sample && (
        <p className="gpa-samplebar" role="status">
          <strong>示例数据</strong>：{SAMPLE_NOTE}
        </p>
      )}

      <ExhibitWorkspace
        stage={
          <div className="gpa-stage">
            <SegmentedControl<GpaView>
              label="可视化视图"
              value={view}
              onChange={(next) => {
                setView(next)
                setSelectedId(null)
              }}
              options={VIEW_ORDER.map((id) => ({ value: id, label: VIEW_INFO[id].label }))}
            />
            <ChartPanel
              result={result}
              view={view}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        }
        controls={<GpaSidePanel result={result} selected={selected} rule={BUAA_RULE} />}
      />

      <CourseEditor
        courses={state.courses}
        statusOf={statusOf}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChange={changeCourse}
        onRemove={removeCourse}
        onAdd={addCourse}
        onResetTargets={resetTargets}
        onLoadSample={loadSample}
        onClear={clearAll}
        onExport={exportJson}
        onImportFile={importFile}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
      />

      <GpaRuleSection rule={BUAA_RULE} />
    </>
  )
}
