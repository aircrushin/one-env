import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Language = 'zh' | 'en'

export type Messages = {
  language: {
    switchTo: {
      zh: string
      en: string
    }
  }
  header: {
    home: string
    projects: string
    login: string
    logout: string
  }
  theme: {
    auto: string
    dark: string
    light: string
    labelAuto: string
    labelDark: string
    labelLight: string
  }
  footer: {
    rights: (year: number) => string
    tagline: string
  }
  home: {
    title: string
    description: string
    openProjects: string
    adminLogin: string
    features: Array<{
      title: string
      description: string
    }>
  }
  about: {
    kicker: string
    title: string
    description: string
  }
  login: {
    title: string
    description: string
    password: string
    signIn: string
    signingIn: string
    loginFailed: string
  }
  projects: {
    title: string
    storage: string
    unknown: string
    notion: string
    memoryFallback: string
    intro: string
    projectList: string
    loadingProjects: string
    noProjects: string
    noDescription: string
    createProject: string
    name: string
    description: string
    creating: string
    createProjectButton: string
    failedToLoadProjects: string
    failedToCreateProject: string
  }
  projectDetail: {
    fallbackProjectName: string
    fallbackProjectDescription: string
    loadingProjectDetails: string
    failedToLoadProject: string
    failedToLoadVariables: string
    operationFailed: string
    creatingEnvironment: string
    creatingVariable: string
    deletingVariable: string
    updatingVariable: string
    importingEnv: string
    exportingEnv: string
    searching: string
    rollbackVersion: string
    importCompleted: (created: number, updated: number, skipped: number, total: number) => string
    selectEnvBeforeCreateScopedVariable: string
    failedToReadEnvFile: string
    selectEnvBeforeImportScopedVariables: string
    pasteOrDropEnvFile: string
    selectEnvBeforeExport: string
    environments: string
    environmentNamePlaceholder: string
    environmentDescriptionPlaceholder: string
    addEnvironment: string
    variablesTitle: (envName: string) => string
    noEnvironmentSelected: string
    environmentScope: string
    globalScope: string
    keyPlaceholder: string
    valuePlaceholder: string
    variableDescriptionPlaceholder: string
    addVariable: string
    globalVariables: string
    environmentVariables: string
    importExport: string
    importToSelectedEnvironment: string
    importToGlobalScope: string
    confirmImport: string
    exportMergedEnv: string
    pasteOrDropHint: string
    chooseEnvFile: string
    loadedFile: (fileName: string) => string
    noFileSelected: string
    importContentPlaceholder: string
    parsedVariablesSummary: (count: number, duplicateCount: number) => string
    noValidEntries: string
    andMore: (count: number) => string
    exportResultPlaceholder: string
    search: string
    searchPlaceholder: string
    searchButton: string
    versionHistory: string
    rollback: string
    snapshotJson: string
  }
  variableList: {
    save: string
    cancel: string
    edit: string
    delete: string
    versionPrefix: string
  }
}

const LANGUAGE_STORAGE_KEY = 'oneenv-language'

const messagesByLanguage: Record<Language, Messages> = {
  zh: {
    language: {
      switchTo: {
        zh: '切换到中文',
        en: 'Switch to English',
      },
    },
    header: {
      home: '首页',
      projects: '项目',
      login: '登录',
      logout: '退出登录',
    },
    theme: {
      auto: '自动',
      dark: '深色',
      light: '浅色',
      labelAuto: '主题模式：自动（跟随系统）。点击切换到浅色模式。',
      labelDark: '主题模式：深色。点击切换模式。',
      labelLight: '主题模式：浅色。点击切换模式。',
    },
    footer: {
      rights: (year) => `© ${year} oneenv。保留所有权利。`,
      tagline: '项目级环境变量中心',
    },
    home: {
      title: '统一管理你的项目与环境变量。',
      description:
        'oneenv 帮助个人与小团队集中管理变量，支持导入导出、全局变量、搜索与可回滚的变更历史。',
      openProjects: '打开项目',
      adminLogin: '管理员登录',
      features: [
        {
          title: '项目 + 环境',
          description: '按项目和环境组织变量，不再分散在各个文件里。',
        },
        {
          title: '导入 / 导出 .env',
          description: '可导入既有文件，并导出合并后的运行时配置。',
        },
        {
          title: '全局变量',
          description: '共享键只定义一次，环境级值可按需覆盖。',
        },
        {
          title: '版本历史',
          description: '记录每次变更，配置出错时可快速回滚。',
        },
      ],
    },
    about: {
      kicker: '关于 oneenv',
      title: '为真实团队打造的轻量环境变量管理。',
      description:
        'oneenv 在零散 `.env` 文件与完整密钥平台之间提供实用方案。它集中管理项目变量，支持导入导出，并保留可回滚的历史记录。',
    },
    login: {
      title: '管理员登录',
      description: '使用管理员密码访问项目与环境变量。',
      password: '密码',
      signIn: '登录',
      signingIn: '登录中...',
      loginFailed: '登录失败',
    },
    projects: {
      title: '项目',
      storage: '存储',
      unknown: '未知',
      notion: 'Notion',
      memoryFallback: '内存回退',
      intro: '创建项目以集中管理环境变量，并让 `.env` 变更可追踪。',
      projectList: '项目列表',
      loadingProjects: '加载项目中...',
      noProjects: '还没有项目。',
      noDescription: '暂无描述',
      createProject: '创建项目',
      name: '名称',
      description: '描述',
      creating: '创建中...',
      createProjectButton: '创建项目',
      failedToLoadProjects: '加载项目失败',
      failedToCreateProject: '创建项目失败',
    },
    projectDetail: {
      fallbackProjectName: '项目',
      fallbackProjectDescription: '管理环境、共享变量、导入导出和版本历史。',
      loadingProjectDetails: '加载项目详情中...',
      failedToLoadProject: '加载项目失败',
      failedToLoadVariables: '加载变量失败',
      operationFailed: '操作失败',
      creatingEnvironment: '正在创建环境...',
      creatingVariable: '正在创建变量...',
      deletingVariable: '正在删除变量...',
      updatingVariable: '正在更新变量...',
      importingEnv: '正在导入 .env...',
      exportingEnv: '正在导出 .env...',
      searching: '搜索中...',
      rollbackVersion: '正在回滚版本...',
      importCompleted: (created, updated, skipped, total) =>
        `导入完成：新增 ${created} 条，更新 ${updated} 条，跳过 ${skipped} 条（共 ${total} 条）`,
      selectEnvBeforeCreateScopedVariable: '请先选择环境，再创建环境作用域变量',
      failedToReadEnvFile: '读取 .env 文件失败',
      selectEnvBeforeImportScopedVariables: '请先选择环境，再导入环境作用域变量',
      pasteOrDropEnvFile: '请粘贴文本或拖入至少包含一个有效变量的 .env 文件',
      selectEnvBeforeExport: '请先选择环境再导出',
      environments: '环境',
      environmentNamePlaceholder: '环境名称',
      environmentDescriptionPlaceholder: '描述',
      addEnvironment: '添加环境',
      variablesTitle: (envName) => `变量（${envName}）`,
      noEnvironmentSelected: '未选择环境',
      environmentScope: '环境作用域',
      globalScope: '全局作用域',
      keyPlaceholder: '键名',
      valuePlaceholder: '值',
      variableDescriptionPlaceholder: '描述',
      addVariable: '添加变量',
      globalVariables: '全局变量',
      environmentVariables: '环境变量',
      importExport: '导入 / 导出',
      importToSelectedEnvironment: '导入到当前环境',
      importToGlobalScope: '导入到全局作用域',
      confirmImport: '确认导入',
      exportMergedEnv: '导出合并后的 .env',
      pasteOrDropHint: '在下方粘贴 `.env` 文本，或将 `.env` 文件拖拽到这里。',
      chooseEnvFile: '选择 .env 文件',
      loadedFile: (fileName) => `已加载：${fileName}`,
      noFileSelected: '未选择文件',
      importContentPlaceholder: '在此粘贴 .env 内容，变量会自动解析。',
      parsedVariablesSummary: (count, duplicateCount) => {
        const suffix =
          duplicateCount > 0 ? `（发现 ${duplicateCount} 个重复键，按最后值合并）` : ''
        return `已解析 ${count} 个变量${suffix}`
      },
      noValidEntries: '未在提供内容中找到有效的 `KEY=value` 条目。',
      andMore: (count) => `...还有 ${count} 项`,
      exportResultPlaceholder: '导出结果',
      search: '搜索',
      searchPlaceholder: '搜索 key / value / description',
      searchButton: '搜索',
      versionHistory: '版本历史',
      rollback: '回滚',
      snapshotJson: '快照 JSON',
    },
    variableList: {
      save: '保存',
      cancel: '取消',
      edit: '编辑',
      delete: '删除',
      versionPrefix: '版本 ',
    },
  },
  en: {
    language: {
      switchTo: {
        zh: '切换到中文',
        en: 'Switch to English',
      },
    },
    header: {
      home: 'Home',
      projects: 'Projects',
      login: 'Login',
      logout: 'Logout',
    },
    theme: {
      auto: 'Auto',
      dark: 'Dark',
      light: 'Light',
      labelAuto: 'Theme mode: auto (system). Click to switch to light mode.',
      labelDark: 'Theme mode: dark. Click to switch mode.',
      labelLight: 'Theme mode: light. Click to switch mode.',
    },
    footer: {
      rights: (year) => `© ${year} oneenv. All rights reserved.`,
      tagline: 'Project-level environment variable center',
    },
    home: {
      title: 'Unified `.env` management for projects and environments.',
      description:
        'oneenv helps individuals and small teams manage variables in one place with import/export, global variables, search, and rollback-ready history.',
      openProjects: 'Open Projects',
      adminLogin: 'Admin Login',
      features: [
        {
          title: 'Project + Environment',
          description: 'Organize variables by project and environment instead of scattered files.',
        },
        {
          title: 'Import / Export .env',
          description: 'Bring existing files in and export merged output for runtime use.',
        },
        {
          title: 'Global Variables',
          description: 'Define shared keys once and let env-specific values override when needed.',
        },
        {
          title: 'Version History',
          description: 'Track every change and roll back when configuration breaks.',
        },
      ],
    },
    about: {
      kicker: 'About oneenv',
      title: 'Lightweight env management for real teams.',
      description:
        'oneenv is a practical middle ground between ad-hoc `.env` files and full secret platforms. It centralizes project variables, supports import/export, and keeps a rollback-capable history.',
    },
    login: {
      title: 'Admin Login',
      description: 'Use your admin password to access project and environment variables.',
      password: 'Password',
      signIn: 'Sign in',
      signingIn: 'Signing in...',
      loginFailed: 'Login failed',
    },
    projects: {
      title: 'Projects',
      storage: 'Storage',
      unknown: 'Unknown',
      notion: 'Notion',
      memoryFallback: 'Memory fallback',
      intro: 'Create a project to centralize its environment variables and keep `.env` changes traceable.',
      projectList: 'Project List',
      loadingProjects: 'Loading projects...',
      noProjects: 'No projects yet.',
      noDescription: 'No description',
      createProject: 'Create Project',
      name: 'Name',
      description: 'Description',
      creating: 'Creating...',
      createProjectButton: 'Create Project',
      failedToLoadProjects: 'Failed to load projects',
      failedToCreateProject: 'Failed to create project',
    },
    projectDetail: {
      fallbackProjectName: 'Project',
      fallbackProjectDescription: 'Manage environments, shared variables, imports, and version history.',
      loadingProjectDetails: 'Loading project details...',
      failedToLoadProject: 'Failed to load project',
      failedToLoadVariables: 'Failed to load variables',
      operationFailed: 'Operation failed',
      creatingEnvironment: 'Creating environment...',
      creatingVariable: 'Creating variable...',
      deletingVariable: 'Deleting variable...',
      updatingVariable: 'Updating variable...',
      importingEnv: 'Importing .env...',
      exportingEnv: 'Exporting .env...',
      searching: 'Searching...',
      rollbackVersion: 'Rolling back version...',
      importCompleted: (created, updated, skipped, total) =>
        `Import complete: ${created} created, ${updated} updated, ${skipped} skipped (${total} total)`,
      selectEnvBeforeCreateScopedVariable:
        'Select an environment before creating env-scoped variables',
      failedToReadEnvFile: 'Failed to read .env file',
      selectEnvBeforeImportScopedVariables:
        'Select an environment before importing env-scoped variables',
      pasteOrDropEnvFile: 'Paste text or drop a .env file with at least one valid variable',
      selectEnvBeforeExport: 'Select an environment before export',
      environments: 'Environments',
      environmentNamePlaceholder: 'Environment name',
      environmentDescriptionPlaceholder: 'Description',
      addEnvironment: 'Add Environment',
      variablesTitle: (envName) => `Variables (${envName})`,
      noEnvironmentSelected: 'No environment selected',
      environmentScope: 'Environment scope',
      globalScope: 'Global scope',
      keyPlaceholder: 'KEY',
      valuePlaceholder: 'value',
      variableDescriptionPlaceholder: 'description',
      addVariable: 'Add Variable',
      globalVariables: 'Global Variables',
      environmentVariables: 'Environment Variables',
      importExport: 'Import / Export',
      importToSelectedEnvironment: 'Import to selected environment',
      importToGlobalScope: 'Import to global scope',
      confirmImport: 'Confirm Import',
      exportMergedEnv: 'Export merged .env',
      pasteOrDropHint: 'Paste your `.env` text below, or drag and drop a `.env` file here.',
      chooseEnvFile: 'Choose .env file',
      loadedFile: (fileName) => `Loaded: ${fileName}`,
      noFileSelected: 'No file selected',
      importContentPlaceholder: 'Paste .env content here. Variables will be parsed automatically.',
      parsedVariablesSummary: (count, duplicateCount) => {
        const variableLabel = count === 1 ? 'variable' : 'variables'
        const duplicateLabel = duplicateCount === 1 ? 'duplicate key' : 'duplicate keys'
        const suffix =
          duplicateCount > 0 ? ` (${duplicateCount} ${duplicateLabel} merged by last value)` : ''
        return `Parsed ${count} ${variableLabel}${suffix}`
      },
      noValidEntries: 'No valid `KEY=value` entries found in the provided content.',
      andMore: (count) => `...and ${count} more`,
      exportResultPlaceholder: 'Export result',
      search: 'Search',
      searchPlaceholder: 'Search key / value / description',
      searchButton: 'Search',
      versionHistory: 'Version History',
      rollback: 'Rollback',
      snapshotJson: 'Snapshot JSON',
    },
    variableList: {
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      versionPrefix: 'v',
    },
  },
}

type I18nContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  messages: Messages
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') {
    return 'zh'
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored === 'zh' || stored === 'en') {
    return stored
  }

  return 'zh'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage)

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      messages: messagesByLanguage[language],
    }),
    [language],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
