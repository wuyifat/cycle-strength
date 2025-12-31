
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, Minus, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, 
  Calendar, Activity, Zap, Trash2, Sparkles, Settings2, Edit3, 
  X, Check, GripVertical, LayoutGrid, ArrowLeft, BrainCircuit, 
  Loader2, Target, Dumbbell, Timer, LogOut, User as UserIcon, 
  CloudCheck, CloudUpload, LogIn, Mail, Fingerprint, Download, Upload, ShieldCheck,
  Search, MoreVertical, RefreshCw, UserCircle, TrendingUp, Scissors, Flame
} from 'lucide-react';
import { DayWorkout, Exercise, AppState, SetRecord, UserPlan, Program, User } from './types';
import { analyzeProgress, generateAiProgram } from './services/geminiService';

const INITIAL_PLAN: UserPlan = {
  daysPerWeek: 4,
  maxWeeks: 4,
  cyclicalReps: ["6-10", "1-5", "6-10", "1-5"],
  weightUnit: 'lb',
};

const KG_TO_LB = 2.20462;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('cyclelift_v3_data');
    if (saved) {
      return JSON.parse(saved);
    }
    return { programs: [], activeProgramId: null, user: null };
  });

  const [hasSkippedLogin, setHasSkippedLogin] = useState(() => {
    return localStorage.getItem('cyclelift_skip_login') === 'true';
  });

  const [view, setView] = useState<'grid' | 'program' | 'consultation'>(
    state.activeProgramId ? 'program' : 'grid'
  );
  
  const [currentWeek, setCurrentWeek] = useState(1);
  const [currentDay, setCurrentDay] = useState(1);
  
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'idle' | 'local'>('synced');
  
  const [modal, setModal] = useState<{
    type: 'exercise' | 'set' | 'edit-reps' | 'choice-update' | 'edit-exercise-name' | 'create-program' | 'profile' | 'google-login';
    exerciseId?: string;
    setId?: string;
    data?: any;
    onConfirm?: (choice: any) => void;
  } | null>(null);

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('cyclelift_v3_data', JSON.stringify(state));

    if (state.user) {
      setSyncStatus('syncing');
      const timer = setTimeout(() => {
        setSyncStatus('synced');
        setState(prev => ({ ...prev, lastSync: Date.now() }));
      }, 1200);
      return () => clearTimeout(timer);
    } else {
      setSyncStatus('local');
    }
  }, [state.programs, state.activeProgramId, state.user]);

  const activeProgram = useMemo(() => 
    state.programs.find(p => p.id === state.activeProgramId) || null
  , [state.programs, state.activeProgramId]);

  const getWorkoutKey = (w: number, d: number) => `W${w}_D${d}`;
  const currentKey = getWorkoutKey(currentWeek, currentDay);
  const week1Key = getWorkoutKey(1, currentDay);

  const getEffectiveWorkout = (): DayWorkout => {
    if (!activeProgram) return { week: currentWeek, day: currentDay, exercises: [] };
    const specificHistory = activeProgram.history[currentKey];
    
    if (specificHistory && specificHistory.exercises.length > 0) return specificHistory;
    
    const week1History = activeProgram.history[week1Key];
    const weeklyDefaultReps = activeProgram.plan.cyclicalReps[currentWeek - 1] || "6-10";
    
    if (currentWeek > 1 && week1History && week1History.exercises.length > 0) {
      return {
        week: currentWeek, day: currentDay,
        exercises: week1History.exercises.map(ex => ({
          ...ex, 
          sets: [], 
          targetReps: ex.isCustomReps ? ex.targetReps : weeklyDefaultReps
        }))
      };
    }
    return { week: currentWeek, day: currentDay, exercises: [] };
  };

  const currentWorkout = getEffectiveWorkout();

  const handleLoginConfirm = (userData: { name: string; email: string }) => {
    const newUser: User = {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      name: userData.name,
      email: userData.email,
      photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=10b981&color=000&bold=true&rounded=true&size=128`
    };

    const knownRaw = localStorage.getItem('cyclelift_known_accounts') || '[]';
    const known = JSON.parse(knownRaw);
    if (!known.find((u: any) => u.email === newUser.email)) {
      known.push(newUser);
      localStorage.setItem('cyclelift_known_accounts', JSON.stringify(known));
    }

    setState(prev => ({ ...prev, user: newUser }));
    setHasSkippedLogin(true);
    localStorage.setItem('cyclelift_skip_login', 'true');
    setModal(null);
  };

  const handleLogout = () => {
    if (confirm("Sign out? Your training data remains safe on this device.")) {
      setState(prev => ({ ...prev, user: null }));
      setModal(null);
    }
  };

  const skipLogin = () => {
    setHasSkippedLogin(true);
    localStorage.setItem('cyclelift_skip_login', 'true');
  };

  const updateProgram = (programId: string, updates: Partial<Program>) => {
    setState(prev => ({
      ...prev,
      programs: prev.programs.map(p => p.id === programId ? { ...p, ...updates } : p)
    }));
  };

  const updateWorkout = (workout: DayWorkout, applyToTemplate: boolean = false) => {
    if (!activeProgram) return;
    const newHistory = { ...activeProgram.history };
    const key = getWorkoutKey(workout.week, workout.day);
    newHistory[key] = workout;
    updateProgram(activeProgram.id, { history: newHistory });
  };

  const handleUpdateWeeklyRange = (newRange: string) => {
    if (!activeProgram) return;
    const newCycle = [...activeProgram.plan.cyclicalReps];
    newCycle[currentWeek - 1] = newRange;
    updateProgram(activeProgram.id, { plan: { ...activeProgram.plan, cyclicalReps: newCycle } });
  };

  const handleCreateProgram = (name: string, templateId?: string) => {
    const template = state.programs.find(p => p.id === templateId);
    const newProgram: Program = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      plan: template ? JSON.parse(JSON.stringify(template.plan)) : INITIAL_PLAN,
      history: template ? Object.fromEntries(
        Object.entries(template.history).map(([k, v]) => [
          k, { ...(v as DayWorkout), exercises: (v as DayWorkout).exercises.map(e => ({ ...e, sets: [] })) }
        ])
      ) : {},
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    };
    setState(prev => ({ ...prev, programs: [newProgram, ...prev.programs], activeProgramId: newProgram.id }));
    setView('program');
    setModal(null);
  };

  const handleAddExercise = (name: string) => {
    if (!activeProgram) return;
    const newExercise: Exercise = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      targetReps: activeProgram.plan.cyclicalReps[currentWeek - 1] || "8-12",
      sets: [],
    };
    const updatedWorkout = {
      ...currentWorkout,
      exercises: [...currentWorkout.exercises, newExercise]
    };
    updateWorkout(updatedWorkout);
    setModal(null);
  };

  const handleAiProgramGenerated = (data: any) => {
    const newProgram: Program = {
      id: Math.random().toString(36).substr(2, 9),
      name: data.name || "AI Generated Block",
      goal: data.goal,
      plan: data.plan,
      history: data.history || {},
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    };
    setState(prev => ({
      ...prev,
      programs: [newProgram, ...prev.programs],
      activeProgramId: newProgram.id
    }));
    setView('program');
    setModal(null);
  };

  const navigate = (dx: number, dy: number) => {
    if (!activeProgram) return;
    setAnalysis(null);
    if (dy !== 0) {
      const nextWeek = Math.max(1, Math.min(activeProgram.plan.maxWeeks, currentWeek + dy));
      setCurrentWeek(nextWeek);
    }
    if (dx !== 0) {
      let nextDay = currentDay + dx;
      let nextWeek = currentWeek;
      if (nextDay > activeProgram.plan.daysPerWeek) {
        if (nextWeek < activeProgram.plan.maxWeeks) {
          nextDay = 1;
          nextWeek++;
        } else {
          nextDay = activeProgram.plan.daysPerWeek;
        }
      } else if (nextDay < 1) {
        if (nextWeek > 1) {
          nextDay = activeProgram.plan.daysPerWeek;
          nextWeek--;
        } else {
          nextDay = 1;
        }
      }
      setCurrentDay(nextDay);
      setCurrentWeek(nextWeek);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const threshold = 50;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > threshold) navigate(-1, 0); 
      else if (dx < -threshold) navigate(1, 0); 
    } else {
      if (dy > threshold) navigate(-1, 1); 
      else if (dy < -threshold) navigate(0, -1); 
    }
    touchStart.current = null;
  };

  const triggerReview = async (forcedGoal?: string) => {
    if (!activeProgram) return;
    setIsAnalyzing(true);
    setAnalysis(null);

    let targetProgram = activeProgram;
    if (forcedGoal) {
      targetProgram = { ...activeProgram, goal: forcedGoal };
      updateProgram(activeProgram.id, { goal: forcedGoal });
    }

    const res = await analyzeProgress(targetProgram, currentWorkout);
    setAnalysis(res);
    setIsAnalyzing(false);
  };

  const renderModal = () => {
    if (!modal) return null;
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setModal(null)}>
        <div className="bg-neutral-900 border border-neutral-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
          {modal.type === 'google-login' ? (
            <GoogleLoginModal onConfirm={handleLoginConfirm} onCancel={() => setModal(null)} />
          ) : modal.type === 'create-program' ? (
            <CreateProgramModal programs={state.programs} onConfirm={handleCreateProgram} onCancel={() => setModal(null)} />
          ) : modal.type === 'profile' ? (
            <ProfileModal user={state.user} onLogout={handleLogout} onLogin={() => setModal({ type: 'google-login' })} />
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-black text-white uppercase tracking-tighter">
                  {modal.type === 'exercise' ? 'New Move' : modal.type === 'set' ? 'Log Effort' : 'Target Specs'}
                </h2>
                <button onClick={() => setModal(null)} className="p-2 text-neutral-500 hover:text-white" aria-label="Close modal"><X size={24} /></button>
              </div>
              <ModalContent modal={modal} unit={activeProgram?.plan.weightUnit || 'lb'} onExercise={handleAddExercise} onSet={(w, r) => {
                const newExercises = currentWorkout.exercises.map(e => e.id === modal.exerciseId ? { ...e, sets: modal.setId ? e.sets.map(s => s.id === modal.setId ? { ...s, weight: w, reps: r } : s) : [...e.sets, { id: Math.random().toString(36).substr(2, 9), weight: w, reps: r, timestamp: Date.now() }] } : e);
                updateWorkout({ ...currentWorkout, exercises: newExercises });
                setModal(null);
              }} onReps={(r) => { updateWorkout({ ...currentWorkout, exercises: currentWorkout.exercises.map(e => e.id === modal.exerciseId ? { ...e, targetReps: r, isCustomReps: true } : e) }); setModal(null); }} onUpdateName={(n) => { updateWorkout({ ...currentWorkout, exercises: currentWorkout.exercises.map(e => e.id === modal.exerciseId ? { ...e, name: n } : e) }, currentWeek === 1); setModal(null); }} />
            </>
          )}
        </div>
      </div>
    );
  };

  const suggestedGoals = [
    { label: "Bulking", icon: <TrendingUp size={14} />, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    { label: "Cutting", icon: <Scissors size={14} />, color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    { label: "Gain Strength", icon: <Dumbbell size={14} />, color: "bg-red-500/20 text-red-400 border-red-500/30" },
    { label: "Endurance", icon: <Flame size={14} />, color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" }
  ];

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 select-none overflow-hidden font-inter">
      {(!state.user && !hasSkippedLogin) ? (
        <LoginView onLogin={() => setModal({ type: 'google-login' })} onSkip={skipLogin} />
      ) : view === 'consultation' ? (
        <ConsultationView 
          onCancel={() => setView('grid')} 
          onComplete={handleAiProgramGenerated} 
        />
      ) : (
        <div className="flex flex-col h-full" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {view === 'grid' ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-in fade-in duration-500">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <button onClick={() => setModal({ type: 'profile' })} className="relative group active:scale-95 transition-transform" aria-label="User Profile">
                    {state.user ? (
                      <img src={state.user.photoUrl} className="w-12 h-12 rounded-2xl border-2 border-emerald-500/30 shadow-lg" alt="Profile" />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl border-2 border-neutral-800 bg-neutral-900 flex items-center justify-center text-neutral-500">
                        <UserCircle size={28} />
                      </div>
                    )}
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-neutral-950 flex items-center justify-center ${syncStatus === 'syncing' ? 'bg-amber-500 animate-pulse' : syncStatus === 'local' ? 'bg-neutral-600' : 'bg-emerald-500'}`}>
                      {syncStatus === 'syncing' ? <RefreshCw size={8} className="text-black animate-spin" /> : syncStatus === 'local' ? <Activity size={8} className="text-white" /> : <CloudCheck size={8} className="text-black" />}
                    </div>
                  </button>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tighter uppercase leading-none">Training Vault</h2>
                    <p className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase mt-1">{state.user ? `Hello, ${state.user.name.split(' ')[0]}` : 'Local Guest Account'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setView('consultation')} className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center gap-2 hover:bg-emerald-500/20 transition-all active:scale-95" aria-label="AI Build Program">
                    <BrainCircuit size={20} />
                    <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">AI Build</span>
                  </button>
                  <button onClick={() => setModal({ type: 'create-program' })} className="p-4 bg-emerald-500 text-black rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all" aria-label="Create New Program">
                    <Plus size={24} strokeWidth={3} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.programs.map(p => (
                  <div key={p.id} onClick={() => { setState(s => ({ ...s, activeProgramId: p.id })); setView('program'); }}
                    className={`group p-6 rounded-3xl border transition-all cursor-pointer relative overflow-hidden ${state.activeProgramId === p.id ? 'bg-emerald-500/10 border-emerald-500' : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'}`}
                  >
                    {state.activeProgramId === p.id && <div className="absolute top-4 right-4 bg-emerald-500 text-black text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Active</div>}
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-1 leading-tight">{p.name}</h3>
                    <div className="flex gap-2 items-center">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{p.plan.daysPerWeek} Days</span>
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{p.plan.maxWeeks} Weeks</span>
                      {p.goal && <span className="text-[8px] font-black text-emerald-500 uppercase border border-emerald-500/20 px-1 rounded">{p.goal}</span>}
                    </div>
                    <div className="mt-4 flex justify-between items-end">
                      <span className="text-[8px] text-neutral-600 mono uppercase">Logged {new Date(p.createdAt).toLocaleDateString()}</span>
                      <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete program?`)) setState(s => ({ ...s, programs: s.programs.filter(pr => pr.id !== p.id), activeProgramId: s.activeProgramId === p.id ? null : s.activeProgramId })); }} className="p-2 text-neutral-700 hover:text-red-500 transition-colors" aria-label="Delete program"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full bg-neutral-950">
              <header className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-3">
                  <button onClick={() => setView('grid')} className="p-2 px-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors text-neutral-400 border border-neutral-700" aria-label="Back to vault">
                    <LayoutGrid size={18} />
                  </button>
                  <div className="flex flex-col">
                    <h1 className="text-xl font-black tracking-tight text-white uppercase leading-none truncate max-w-[150px]">{activeProgram?.name}</h1>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-1">
                      <span className="bg-emerald-500/10 px-1 rounded">WK {currentWeek}</span>
                      <span className="bg-emerald-500/10 px-1 rounded">DAY {currentDay}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setCurrentWeek(1); setCurrentDay(1); setAnalysis(null); }} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-neutral-700 shadow-lg">Today</button>
                  <button onClick={() => setIsEditingPlan(!isEditingPlan)} className={`p-2 rounded-xl transition-all border ${isEditingPlan ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-neutral-800 text-neutral-400 border-neutral-700'}`} aria-label="Edit Program Plan"><Settings2 size={18} /></button>
                </div>
              </header>

              <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-48 scroll-smooth">
                {isEditingPlan ? (
                  <PlanEditor plan={activeProgram!.plan} currentWeek={currentWeek} onUpdateRange={handleUpdateWeeklyRange} updatePlan={(u) => updateProgram(activeProgram!.id, { plan: { ...activeProgram!.plan, ...u } })} />
                ) : (
                  <>
                    <div className="bg-neutral-900/50 p-4 rounded-3xl border border-neutral-800/50 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Target Cycle</span>
                        <span className="text-xl font-black text-emerald-400 mono">{activeProgram?.plan.cyclicalReps[currentWeek - 1] || "—"} REPS</span>
                      </div>
                      <div className="flex gap-1 items-center">
                        <div className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500' : syncStatus === 'local' ? 'bg-neutral-600' : 'bg-amber-500 animate-pulse'}`} />
                        <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">
                          {syncStatus === 'synced' ? 'Cloud Synced' : syncStatus === 'local' ? 'Local Only' : 'Syncing...'}
                        </span>
                      </div>
                    </div>

                    {analysis && (
                      <div className="bg-neutral-900 border border-emerald-500/20 p-5 rounded-3xl animate-in zoom-in-95 duration-300">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="text-emerald-400" size={18} />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Strategic Performance Review</h4>
                        </div>
                        <p className="text-sm text-neutral-300 leading-relaxed italic">{analysis}</p>
                        
                        <div className="mt-6">
                          <h5 className="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-3 ml-1">Update Training Focus</h5>
                          <div className="flex flex-wrap gap-2">
                            {suggestedGoals.map((g) => (
                              <button 
                                key={g.label} 
                                onClick={() => triggerReview(g.label)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all active:scale-95 ${g.label === activeProgram?.goal ? 'ring-2 ring-white/20' : ''} ${g.color}`}
                              >
                                {g.icon}
                                {g.label}
                                {g.label === activeProgram?.goal && <Check size={10} strokeWidth={4} />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {currentWorkout.exercises.map((ex) => (
                        <ExerciseCard 
                          key={ex.id} exercise={ex} unit={activeProgram!.plan.weightUnit}
                          onAddSet={() => setModal({ type: 'set', exerciseId: ex.id })}
                          onEditSet={(s) => setModal({ type: 'set', exerciseId: ex.id, setId: s.id, data: { weight: s.weight, reps: s.reps } })}
                          onEditReps={() => setModal({ type: 'edit-reps', exerciseId: ex.id, data: ex.targetReps })}
                          onEditName={() => setModal({ type: 'edit-exercise-name', exerciseId: ex.id, data: ex.name })}
                          onDeleteSet={(sid) => updateWorkout({ ...currentWorkout, exercises: currentWorkout.exercises.map(e => e.id === ex.id ? { ...e, sets: e.sets.filter(s => s.id !== sid) } : e) })}
                          onDeleteExercise={() => confirm("Delete move?") && updateWorkout({ ...currentWorkout, exercises: currentWorkout.exercises.filter(e => e.id !== ex.id) })}
                        />
                      ))}
                      {currentWorkout.exercises.length === 0 && (
                        <div className="py-20 flex flex-col items-center text-neutral-600 border-2 border-dashed border-neutral-800 rounded-3xl">
                          <Plus size={32} className="mb-2 opacity-20" />
                          <p className="text-sm font-bold uppercase tracking-widest">No moves logged</p>
                          <button onClick={() => setModal({ type: 'exercise' })} className="mt-4 text-emerald-500 font-black text-xs uppercase tracking-widest bg-emerald-500/10 px-4 py-2 rounded-xl">+ Add First Move</button>
                        </div>
                      )}
                    </div>
                    
                    <button 
                      onClick={() => triggerReview()}
                      disabled={isAnalyzing || currentWorkout.exercises.length === 0}
                      className="w-full py-5 bg-neutral-900 border border-neutral-800 rounded-3xl flex items-center justify-center gap-3 hover:bg-neutral-800 transition-all shadow-xl group"
                    >
                      {isAnalyzing ? <Loader2 className="animate-spin text-emerald-400" size={18} /> : <Sparkles size={18} className="text-emerald-400 group-hover:scale-125 transition-transform" />}
                      <span className="text-sm font-black tracking-widest uppercase">Performance Review</span>
                    </button>
                  </>
                )}
              </main>

              <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/90 to-transparent z-40 pointer-events-none">
                <div className="max-w-md mx-auto flex justify-between items-center pointer-events-auto">
                  <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-2xl border border-neutral-800 shadow-2xl">
                    <button onClick={() => navigate(-1, 0)} className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl active:scale-90 transition-transform" aria-label="Previous Day"><ChevronLeft size={20} strokeWidth={3} /></button>
                    <div className="flex flex-col items-center px-2 min-w-[50px]"><span className="text-[10px] font-black text-emerald-400 leading-none">DAY</span><span className="text-xl font-black mono text-white leading-none">{currentDay}</span></div>
                    <button onClick={() => navigate(1, 0)} className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl active:scale-90 transition-transform" aria-label="Next Day"><ChevronRight size={20} strokeWidth={3} /></button>
                  </div>
                  
                  <button onClick={() => setModal({ type: 'exercise' })} className="h-16 w-16 bg-emerald-500 hover:bg-emerald-400 text-black rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all border-4 border-neutral-950" aria-label="Add Exercise">
                    <Plus size={32} strokeWidth={4} />
                  </button>
                  
                  <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-2xl border border-neutral-800 shadow-2xl">
                    <button onClick={() => navigate(0, -1)} className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl active:scale-90 transition-transform" aria-label="Previous Week"><ChevronUp size={20} strokeWidth={3} /></button>
                    <div className="flex flex-col items-center px-2 min-w-[50px]"><span className="text-[10px] font-black text-emerald-400 leading-none">WK</span><span className="text-xl font-black mono text-white leading-none">{currentWeek}</span></div>
                    <button onClick={() => navigate(0, 1)} className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl active:scale-90 transition-transform" aria-label="Next Week"><ChevronDown size={20} strokeWidth={3} /></button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {renderModal()}
    </div>
  );
};

// --- Custom Components ---

const GoogleLoginModal: React.FC<{ onConfirm: (data: { name: string; email: string }) => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [knownAccounts, setKnownAccounts] = useState<User[]>(() => {
    const saved = localStorage.getItem('cyclelift_known_accounts');
    return saved ? JSON.parse(saved) : [];
  });
  const [step, setStep] = useState(knownAccounts.length > 0 ? 1 : 2);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <svg className="w-10 h-10 mb-4" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <h2 className="text-2xl font-semibold text-white mb-1">Choose an account</h2>
        <p className="text-neutral-400 text-sm">to sign in to CycleLift</p>
      </div>

      <div className="space-y-2">
        {step === 1 ? (
          <div className="space-y-1">
            {knownAccounts.map((account) => (
              <button key={account.email} onClick={() => onConfirm({ name: account.name, email: account.email })}
                className="w-full text-left p-4 hover:bg-neutral-800 border-b border-neutral-800 flex items-center gap-3 transition-all active:bg-neutral-800"
              >
                <img src={account.photoUrl} className="w-10 h-10 rounded-full" alt="Avatar" />
                <div className="flex flex-col flex-1">
                  <span className="text-sm font-semibold text-white leading-none mb-1">{account.name}</span>
                  <span className="text-xs text-neutral-500 leading-none">{account.email}</span>
                </div>
              </button>
            ))}
            <button onClick={() => setStep(2)} className="w-full text-left p-4 hover:bg-neutral-800 flex items-center gap-3 transition-colors mt-2">
              <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400">
                <UserIcon size={20} />
              </div>
              <span className="text-sm font-medium text-white">Use another account</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-in slide-in-from-right-4">
            <div className="space-y-3">
              <input autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="Email or phone" className="w-full bg-transparent border border-neutral-700 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-all" />
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full bg-transparent border border-neutral-700 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-all" />
            </div>
            <div className="flex justify-between items-center mt-6">
              <button onClick={() => knownAccounts.length > 0 ? setStep(1) : onCancel()} className="px-4 py-2 text-blue-400 font-medium text-sm hover:bg-blue-400/5 rounded transition-colors">
                {knownAccounts.length > 0 ? 'Back' : 'Cancel'}
              </button>
              <button onClick={() => name && email && onConfirm({ name, email })} className="px-6 py-2 bg-blue-600 text-white font-semibold text-sm rounded-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50" disabled={!name || !email}>
                Continue
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-neutral-500 text-center px-4 leading-relaxed border-t border-neutral-800 pt-4">
        Sign in to automatically sync your local training data to the cloud.
      </p>
    </div>
  );
};

const ProfileModal: React.FC<{ user: User | null; onLogout: () => void; onLogin: () => void }> = ({ user, onLogout, onLogin }) => (
  <div className="space-y-6">
    <div className="flex flex-col items-center gap-4">
      {user ? (
        <img src={user.photoUrl} className="w-24 h-24 rounded-full border-4 border-emerald-500 shadow-2xl" alt="Profile" />
      ) : (
        <div className="w-24 h-24 rounded-full border-4 border-neutral-800 bg-neutral-900 flex items-center justify-center text-neutral-500">
          <UserCircle size={64} />
        </div>
      )}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{user ? user.name : 'Guest User'}</h2>
          {user && <ShieldCheck size={20} className="text-emerald-500" />}
        </div>
        <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">{user ? user.email : 'Local Storage Only'}</p>
      </div>
    </div>
    
    <div className="space-y-2">
      <div className="bg-neutral-800/30 p-4 rounded-2xl border border-neutral-800 flex justify-between items-center">
        <div>
          <span className="text-[10px] font-black text-neutral-500 uppercase block tracking-widest">Account Status</span>
          <span className={`text-xs font-bold ${user ? 'text-emerald-400' : 'text-amber-400'}`}>{user ? 'Cloud Persistent' : 'Local Persistence'}</span>
        </div>
        {user ? <CloudCheck className="text-emerald-500" size={24} /> : <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500"><Activity size={14} /></div>}
      </div>
    </div>

    {user ? (
      <button onClick={onLogout} className="w-full py-4 bg-red-500/10 border border-red-500/20 text-red-500 font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all">
        <LogOut size={18} /> Sign Out
      </button>
    ) : (
      <button onClick={onLogin} className="w-full py-4 bg-emerald-500 text-black font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all">
        <LogIn size={18} /> Sign In to Cloud
      </button>
    )}
  </div>
);

const LoginView: React.FC<{ onLogin: () => void; onSkip: () => void }> = ({ onLogin, onSkip }) => (
  <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 p-8 text-center relative overflow-hidden">
    <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-emerald-500/10 to-transparent" />
    <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px]" />
    
    <div className="relative mb-16 flex flex-col items-center animate-in zoom-in-95 duration-700">
      <div className="w-24 h-24 bg-emerald-500 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-emerald-500/40 mb-8">
        <Dumbbell size={48} className="text-black" strokeWidth={3} aria-hidden="true" />
      </div>
      <h1 className="text-6xl font-black text-white uppercase tracking-tighter leading-none mb-2">CycleLift</h1>
      <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.5em] opacity-80">Sync your PRs</p>
    </div>

    <div className="w-full max-w-xs space-y-4 relative z-10">
      <button onClick={onLogin} className="w-full bg-white text-black py-4 px-6 rounded-full font-bold text-sm flex items-center justify-center gap-3 shadow-2xl hover:bg-neutral-100 transition-all active:scale-95 border border-neutral-200">
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Google Login
      </button>
      
      <button onClick={onSkip} className="w-full py-4 text-neutral-500 font-bold text-xs uppercase tracking-[0.2em] hover:text-white transition-colors">
        Continue without Login
      </button>

      <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest leading-relaxed pt-8">
        Your data is safe. Sync starts automatically upon login.
      </p>
    </div>
  </div>
);

const ConsultationView: React.FC<{ onCancel: () => void; onComplete: (data: any) => void }> = ({ onCancel, onComplete }) => {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState('');
  const [exp, setExp] = useState('');
  const [days, setDays] = useState(4);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Consulting Training Experts...');

  const messages = ['Searching methodologies...', 'Customizing set-rep protocols...', 'Optimizing volume...', 'Finalizing AI block...'];

  useEffect(() => {
    let i = 0;
    if (isGenerating) {
      const interval = setInterval(() => {
        setLoadingMsg(messages[i % messages.length]);
        i++;
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  const handleStart = async () => {
    setIsGenerating(true);
    try {
      const data = await generateAiProgram(goal, exp, days);
      onComplete(data);
    } catch (e) {
      alert("Failed to build program. Try a manual setup.");
      onCancel();
    }
  };

  const steps = [
    { title: "Training Goal", icon: <Target className="text-emerald-400" size={32} />, options: ["Strength & Power", "Muscle Hypertrophy", "Fat Loss / Cut"] },
    { title: "Lifter Status", icon: <Dumbbell className="text-emerald-400" size={32} />, options: ["Beginner", "Intermediate", "Advanced"] },
    { title: "Weekly Volume", icon: <Timer className="text-emerald-400" size={32} />, options: ["3 Days", "4 Days", "5 Days"] }
  ];

  if (isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 p-8 text-center">
        <Loader2 className="animate-spin text-emerald-400 mb-6" size={64} strokeWidth={1} />
        <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Building Your Routine</h2>
        <p className="text-neutral-500 text-sm italic font-medium">{loadingMsg}</p>
      </div>
    );
  }

  const currentStep = steps[step];

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 p-6 overflow-y-auto animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-center mb-12">
        <button onClick={onCancel} className="p-2 text-neutral-500 hover:text-white" aria-label="Cancel AI generation"><ArrowLeft /></button>
        <div className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map(i => <div key={i} className={`h-1 w-6 rounded-full ${i === step ? 'bg-emerald-500' : 'bg-neutral-800'}`} />)}
        </div>
        <div className="w-8" />
      </header>
      <div className="flex-1 max-w-md mx-auto w-full flex flex-col items-center justify-center">
        <div className="mb-6 p-6 bg-neutral-900 rounded-full border border-neutral-800">
          {currentStep.icon}
        </div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter text-center mb-10">{currentStep.title}</h2>
        <div className="grid grid-cols-1 gap-3 w-full">
          {currentStep.options.map((opt) => (
            <button key={opt} onClick={() => {
              if (step === 0) setGoal(opt);
              if (step === 1) setExp(opt);
              if (step === 2) setDays(parseInt(opt) || 4);
              
              if (step < steps.length - 1) setStep(s => s + 1);
              else handleStart();
            }}
              className="p-5 bg-neutral-900 border border-neutral-800 hover:border-emerald-500 text-white font-black text-sm uppercase tracking-widest rounded-3xl transition-all active:scale-95 text-center"
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const CreateProgramModal: React.FC<{ programs: Program[], onConfirm: (name: string, tid?: string) => void, onCancel: () => void }> = ({ programs, onConfirm, onCancel }) => {
  const [name, setName] = useState('');
  const [tid, setTid] = useState<string | undefined>();
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-black text-white uppercase tracking-tighter text-center">New Program</h2>
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-neutral-600 uppercase tracking-widest mb-1 block">Title</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-emerald-500" placeholder="e.g. Hypertrophy Block 1" />
        </div>
        <div>
          <label className="text-[10px] font-black text-neutral-600 uppercase tracking-widest mb-1 block">Clone From</label>
          <select className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-4 text-white font-bold outline-none appearance-none" onChange={e => setTid(e.target.value || undefined)}>
            <option value="">Start Fresh</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onCancel} className="py-4 bg-neutral-800 text-neutral-400 font-bold rounded-2xl">Cancel</button>
        <button onClick={() => onConfirm(name || 'New Block', tid)} className="py-4 bg-emerald-500 text-black font-black rounded-2xl">Create</button>
      </div>
    </div>
  );
};

const ModalContent: React.FC<{ modal: any, unit: string, onExercise: (n: string) => void, onSet: (w: number, r: number) => void, onReps: (r: string) => void, onUpdateName: (n: string) => void }> = ({ modal, unit, onExercise, onSet, onReps, onUpdateName }) => {
  const [val1, setVal1] = useState(modal.data?.weight !== undefined ? modal.data.weight.toString() : (['edit-reps', 'exercise', 'edit-exercise-name'].includes(modal.type) ? (modal.data || '') : ''));
  const [val2, setVal2] = useState(modal.data?.reps !== undefined ? modal.data.reps.toString() : '');
  if (['exercise', 'edit-exercise-name'].includes(modal.type)) return (
    <div className="space-y-4">
      <input autoFocus placeholder="e.g. Bench Press" className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-emerald-500" value={val1} onChange={e => setVal1(e.target.value)} />
      <button onClick={() => (modal.type === 'exercise' ? onExercise(val1) : onUpdateName(val1))} disabled={!val1.trim()} className="w-full py-4 bg-emerald-500 text-black font-black rounded-2xl">Confirm</button>
    </div>
  );
  if (modal.type === 'set') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-[10px] font-black text-neutral-600 mb-1 block uppercase">{unit}</label><input autoFocus type="number" step="any" className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-4 text-white text-xl font-black mono outline-none focus:border-emerald-500" value={val1} onChange={e => setVal1(e.target.value)} /></div>
        <div><label className="text-[10px] font-black text-neutral-600 mb-1 block uppercase">Reps</label><input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-4 text-white text-xl font-black mono outline-none focus:border-emerald-500" value={val2} onChange={e => setVal2(e.target.value)} /></div>
      </div>
      <button onClick={() => onSet(parseFloat(val1) || 0, parseInt(val2) || 0)} className="w-full py-4 bg-emerald-500 text-black font-black rounded-2xl">Save Set</button>
    </div>
  );
  if (modal.type === 'edit-reps') return (
    <div className="space-y-4">
      <label className="text-[10px] font-black text-neutral-600 uppercase ml-1 block">Rep Range</label>
      <input autoFocus placeholder="e.g. 6-10" className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-emerald-500" value={val1} onChange={e => setVal1(e.target.value)} />
      <button onClick={() => onReps(val1)} className="w-full py-4 bg-emerald-500 text-black font-black rounded-2xl">Save Range</button>
    </div>
  );
  return null;
};

const ExerciseCard: React.FC<{ exercise: Exercise; unit: string; onAddSet: () => void; onEditSet: (set: SetRecord) => void; onEditReps: () => void; onEditName: () => void; onDeleteSet: (id: string) => void; onDeleteExercise: () => void; }> = ({ exercise, unit, onAddSet, onEditSet, onEditReps, onEditName, onDeleteSet, onDeleteExercise }) => (
  <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl transition-all hover:border-neutral-700">
    <div className="p-4 flex justify-between items-start bg-neutral-800/20 border-b border-neutral-800/50">
      <div className="flex items-start gap-3">
        <GripVertical size={18} className="text-neutral-700 mt-1 shrink-0" />
        <div>
          <h3 onClick={onEditName} className="font-black text-lg text-white capitalize leading-tight cursor-pointer hover:text-emerald-400 flex items-center gap-2 transition-colors">{exercise.name} <Edit3 size={12} className="opacity-20" /></h3>
          <button onClick={onEditReps} className="flex items-center gap-1.5 mt-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20" aria-label={`Target reps for ${exercise.name}: ${exercise.targetReps}`}>
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{exercise.targetReps} REPS</span>
            <Edit3 size={10} className="text-emerald-500/50" />
          </button>
        </div>
      </div>
      <button onClick={onDeleteExercise} className="p-2 text-neutral-700 hover:text-red-500" aria-label={`Delete ${exercise.name}`}><Trash2 size={18} /></button>
    </div>
    <div className="p-4 overflow-x-auto custom-scrollbar">
      <div className="flex gap-2 min-w-max pb-2">
        <div className="flex flex-col gap-2 pr-3 border-r border-neutral-800/50 sticky left-0 bg-neutral-900 z-10">
          <div className="h-10 flex items-center text-[10px] font-black text-neutral-600 uppercase tracking-widest">{unit}</div>
          <div className="h-10 flex items-center text-[10px] font-black text-neutral-600 uppercase tracking-widest">REPS</div>
        </div>
        {exercise.sets.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 min-w-[60px] group relative cursor-pointer" onClick={() => onEditSet(s)}>
            <div className="h-10 bg-neutral-800/50 rounded-xl flex items-center justify-center font-black mono text-emerald-400 group-hover:bg-neutral-700">{s.weight}</div>
            <div className="h-10 bg-neutral-800/50 rounded-xl flex items-center justify-center font-black mono text-neutral-400 group-hover:bg-neutral-700">{s.reps}</div>
            <button onClick={(e) => { e.stopPropagation(); onDeleteSet(s.id); }} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100" aria-label="Remove set"><Minus size={10} strokeWidth={4} /></button>
          </div>
        ))}
        <button onClick={onAddSet} className="flex flex-col gap-2 min-w-[60px] group" aria-label="Add set">
          <div className="h-10 border-2 border-dashed border-neutral-800 rounded-xl flex items-center justify-center text-neutral-800 group-hover:border-emerald-500/30 group-hover:text-emerald-400 transition-all"><Plus size={16} strokeWidth={3} /></div>
          <div className="h-10 border-2 border-dashed border-neutral-800 rounded-xl flex items-center justify-center text-neutral-800 group-hover:border-emerald-500/30 group-hover:text-emerald-400 transition-all"><Plus size={16} strokeWidth={3} /></div>
        </button>
      </div>
    </div>
  </div>
);

const PlanEditor: React.FC<{ plan: UserPlan, currentWeek: number, onUpdateRange: (r: string) => void, updatePlan: (u: Partial<UserPlan>) => void }> = ({ plan, currentWeek, onUpdateRange, updatePlan }) => (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-neutral-900 p-5 rounded-3xl border border-neutral-800"><span className="text-[10px] text-neutral-500 font-black uppercase block mb-1">Days / Week</span><input type="number" value={plan.daysPerWeek} onChange={e => updatePlan({ daysPerWeek: parseInt(e.target.value) || 1 })} className="bg-transparent text-3xl font-black w-full outline-none text-emerald-400 mono focus:text-emerald-300" /></div>
      <div className="bg-neutral-900 p-5 rounded-3xl border border-neutral-800"><span className="text-[10px] text-neutral-500 font-black uppercase block mb-1">Max Weeks</span><input type="number" value={plan.maxWeeks} onChange={e => updatePlan({ maxWeeks: parseInt(e.target.value) || 1 })} className="bg-transparent text-3xl font-black w-full outline-none text-emerald-400 mono focus:text-emerald-300" /></div>
    </div>
    <div className="space-y-3">
      <label className="text-[10px] font-black text-neutral-600 uppercase tracking-widest ml-2">Cycle Configuration</label>
      <div className="grid gap-2">
        {plan.cyclicalReps.map((range, idx) => (
          <div key={idx} className={`flex items-center gap-4 bg-neutral-900 p-4 rounded-2xl border ${idx === currentWeek - 1 ? 'border-emerald-500 shadow-lg' : 'border-neutral-800'}`}>
            <span className="text-xs font-black mono text-neutral-500 w-12">W{idx + 1}</span>
            <input type="text" value={range} onChange={e => idx === currentWeek - 1 ? onUpdateRange(e.target.value) : updatePlan({ cyclicalReps: plan.cyclicalReps.map((r, i) => i === idx ? e.target.value : r) })} className="bg-transparent text-emerald-400 font-black text-lg outline-none flex-1 mono focus:text-emerald-300" />
            <button onClick={() => updatePlan({ cyclicalReps: plan.cyclicalReps.filter((_, i) => i !== idx) })} className="text-neutral-700 hover:text-red-500" aria-label={`Remove week ${idx + 1}`}><Trash2 size={16} /></button>
          </div>
        ))}
        <button onClick={() => updatePlan({ cyclicalReps: [...plan.cyclicalReps, "6-10"] })} className="w-full py-4 border-2 border-dashed border-neutral-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-neutral-600 hover:border-emerald-500/20 hover:text-emerald-500 transition-all">+ Add Week</button>
      </div>
    </div>
  </div>
);

export default App;
