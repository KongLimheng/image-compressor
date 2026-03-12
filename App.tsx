import React, {useMemo, useState, useEffect, useRef, useCallback} from 'react';
import {Header} from './components/Header';
import {Footer} from './components/Footer';
import {Dropzone} from './components/Dropzone';
import {JobCard} from './components/JobCard';
import {SettingsPanel} from './components/SettingsPanel';
import {ComparisonModal} from './components/ComparisonModal';
import {StatsPanel} from './components/StatsPanel';
import {Toast} from './components/Toast';
import {Features} from './components/Features';

import {useOptimizer} from './hooks/useOptimizer';
import {useDownloader} from './hooks/useDownloader';
import {OptimizerConfiguration, ImageJob, OutputFormat} from './types';
import {DEFAULT_SETTINGS} from './constants';
import {downloadJob, generateFilename} from './utils';

const SETTINGS_STORAGE_KEY = 'blairpng_settings_v1';

const App = () => {
  // settings
  const [settings, setSettings] = useState<OptimizerConfiguration>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return saved
        ? {...DEFAULT_SETTINGS, ...JSON.parse(saved)}
        : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save settings', err);
    }
  }, [settings]);

  // theme ui
  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (t: 'light' | 'dark') => {
      if (t === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    };

    if (settings.theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';
      applyTheme(systemTheme);
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) =>
        applyTheme(e.matches ? 'dark' : 'light');
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    } else {
      applyTheme(settings.theme);
    }
  }, [settings.theme]);

  // --- 3. STATE & HOOKS ---
  const [inspectedJob, setInspectedJob] = useState<ImageJob | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    isVisible: boolean;
    type: 'success' | 'error';
  }>({message: '', isVisible: false, type: 'success'});

  const {jobs, addFiles, removeJob, clearCompleted, clearAll, isProcessing} =
    useOptimizer(settings);
  const {isZipping, handleDownloadZip, handleDownloadIndividual} =
    useDownloader();

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => a.file.size - b.file.size);
  }, [jobs]);

  const completedJobs = useMemo(
    () => jobs.filter(job => job.status === 'done'),
    [jobs],
  );

  const prevIsProcessing = useRef(false);
  useEffect(() => {
    const justFinished = prevIsProcessing.current && !isProcessing;
    if (justFinished && completedJobs.length > 0) {
      showToast('Batch optimization complete!');
    }
    prevIsProcessing.current = isProcessing;
  }, [isProcessing, completedJobs.length]);

  useEffect(() => {
    if (settings.autoDownload) {
      const recentlyFinishedJob = jobs.find(
        job =>
          job.status === 'done' &&
          job.optimizedBlob &&
          !(job.optimizedBlob as Record<string, unknown>)[
            '__hasAutoDownloaded'
          ],
      );

      if (recentlyFinishedJob && recentlyFinishedJob.optimizedBlob) {
        (recentlyFinishedJob.optimizedBlob as Record<string, unknown>)[
          '__hasAutoDownloaded'
        ] = true;

        const index =
          sortedJobs.findIndex(j => j.id === recentlyFinishedJob.id) +
          (settings.renaming.startSequence || 1);
        const name = generateFilename(
          recentlyFinishedJob.file.name,
          settings.renaming.pattern,
          index,
        );

        downloadJob(recentlyFinishedJob, name);
        showToast(`Auto-downloaded ${name}`);
      }
    }
  }, [jobs, settings.autoDownload, settings.renaming, sortedJobs]);

  const showToast = (
    message: string,
    type: 'success' | 'error' = 'success',
  ) => {
    setToast({message, isVisible: true, type});
    setTimeout(() => setToast(prev => ({...prev, isVisible: false})), 3000);
  };

  const handleFilesAdded = useCallback(
    async (files: File[]) => {
      try {
        const rejectedCount = await addFiles(files);
        if (rejectedCount > 0) {
          showToast(
            `Security Alert: ${rejectedCount} files blocked (invalid signature).`,
            'error',
          );
        }
      } catch (err) {
        console.error('Error adding files:', err);
        showToast('Failed to add files', 'error');
      }
    },
    [addFiles, showToast],
  );

  const handleSettingsUpdate = <K extends keyof OptimizerConfiguration>(
    key: K,
    value: OptimizerConfiguration[K],
  ) => {
    setSettings(prev => ({...prev, [key]: value}));
  };

  const inspectionUrls = useMemo(() => {
    if (!inspectedJob || !inspectedJob.optimizedBlob) {
      return null;
    }
    const isUnsupported = inspectedJob.optimizedBlob.type === 'image/qoi';
    const optimizedUrl = isUnsupported
      ? inspectedJob.previewUrl
      : URL.createObjectURL(inspectedJob.optimizedBlob);
    return {
      original: inspectedJob.previewUrl,
      optimized: optimizedUrl,
    };
  }, [inspectedJob]);

  useEffect(() => {
    return () => {
      if (
        inspectionUrls?.optimized &&
        inspectionUrls.optimized.startsWith('blob:')
      ) {
        URL.revokeObjectURL(inspectionUrls.optimized);
      }
    };
  }, [inspectionUrls]);

  const extensionMap: Record<OutputFormat, string> = useMemo(
    () => ({
      png: 'png',
      webp: 'webp',
      jpeg: 'jpg',
      avif: 'avif',
      qoi: 'qoi',
      jxl: 'jxl',
    }),
    [],
  );

  const mimeToExt: Record<string, string> = useMemo(
    () => ({
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/avif': 'avif',
      'image/qoi': 'qoi',
      'image/jxl': 'jxl',
    }),
    [],
  );

  // render
  return (
    <div className="min-h-screen bg-rainbow-gradient font-sans flex flex-col text-gleam-dark transition-colors duration-300">
      <Header />

      <main
        id="main-content"
        className="flex-1 relative z-10 pt-16 focus:outline-none"
        tabIndex={-1}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-32 md:mb-52">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative mb-12">
            <div className="lg:col-span-8 space-y-6">
              <Dropzone
                onFilesAdded={handleFilesAdded}
                isProcessing={isProcessing}
                compact={jobs.length > 0}
              />

              {jobs.length > 0 && (
                <div className="space-y-4" aria-live="polite">
                  <div className="flex items-center justify-between px-2">
                    <h2 className="text-2xl font-display font-bold text-gleam-dark dark:text-slate-900 flex items-center gap-3">
                      Queue
                      <span className="bg-gleam-pink text-gleam-dark text-sm py-1 px-3 rounded-full font-bold">
                        {jobs.length}
                      </span>
                    </h2>
                    <div className="flex items-center gap-3">
                      {isProcessing && (
                        <span className="text-sm font-bold text-gleam-pink animate-pulse bg-gleam-dark px-3 py-1 rounded-full">
                          Processing...
                        </span>
                      )}
                      <button
                        onClick={clearAll}
                        className="text-xs font-bold text-gray-500 hover:text-red-600 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[480px] overflow-y-auto job-queue-scroll rounded-2xl">
                    <div className="flex flex-col gap-3" role="list">
                      {sortedJobs.map((job, index) => {
                        const seq = settings.renaming.startSequence + index;
                        const downloadName = generateFilename(
                          job.file.name,
                          settings.renaming.pattern,
                          seq,
                        );

                        let ext = extensionMap[settings.outputFormat] || 'png';

                        if (settings.maintainOriginalFormat) {
                          const inputExt = job.file.name
                            .split('.')
                            .pop()
                            ?.toLowerCase();
                          if (
                            inputExt &&
                            [
                              'png',
                              'jpg',
                              'jpeg',
                              'webp',
                              'avif',
                              'jxl',
                              'qoi',
                            ].includes(inputExt)
                          ) {
                            ext = inputExt === 'jpeg' ? 'jpg' : inputExt;
                          } else if (inputExt === 'gif') {
                            ext = 'png';
                          }
                        }

                        if (job.status === 'done' && job.optimizedBlob) {
                          ext = mimeToExt[job.optimizedBlob.type] || ext;
                        }

                        const displayName = `${downloadName}.${ext}`;

                        return (
                          <JobCard
                            key={job.id}
                            job={job}
                            onRemove={removeJob}
                            onCopySuccess={() =>
                              showToast('Copied to clipboard!')
                            }
                            onInspect={setInspectedJob}
                            downloadFilename={downloadName}
                            displayName={displayName}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 h-full">
              <StatsPanel
                completedJobs={completedJobs}
                onDownloadAll={() => {
                  handleDownloadIndividual(completedJobs, jobs, settings);
                  showToast(`Starting ${completedJobs.length} downloads...`);
                }}
                onDownloadZip={() => {
                  showToast('Preparing ZIP archive...');
                  void handleDownloadZip(
                    completedJobs,
                    jobs,
                    settings,
                    () => showToast('ZIP downloaded successfully!'),
                    () => showToast('Failed to generate ZIP', 'error'),
                  );
                }}
                onClearCompleted={clearCompleted}
                isZipping={isZipping}
              />
            </div>
          </div>

          <SettingsPanel settings={settings} onUpdate={handleSettingsUpdate} />
        </div>
      </main>

      <Footer />
      <Features />

      {inspectedJob && inspectionUrls && (
        <ComparisonModal
          isOpen={!!inspectedJob}
          originalUrl={inspectionUrls.original}
          optimizedUrl={inspectionUrls.optimized}
          filename={inspectedJob.file.name}
          onClose={() => setInspectedJob(null)}
        />
      )}

      <Toast
        message={toast.message}
        isVisible={toast.isVisible}
        type={toast.type}
      />
    </div>
  );
};

export default App;
