import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Calendar, Play, Search, ChevronLeft, GripVertical, RefreshCw, 
    Download, Save, AlertCircle, CheckCircle2, HeartPulse, Activity, 
    Layers, ShieldAlert, UserCog, BarChart3, Info, HandHeart, 
    ArrowLeftRight, Users, TrendingUp, CalendarDays, GitBranch, 
    Lightbulb, UserCheck, UserX, LayoutList, 
    ArrowUpDown, X, Database, AlertTriangle,
    Home, LogOut
} from 'lucide-react';

const safeParseJSON = (data, fallback) => {
    if (!data) return fallback;
    if (typeof data !== 'string') return data;
    try { return JSON.parse(data); } catch (e) { return fallback; }
};

const SchedulingAndGovernance = ({ session, goBack, goToMembers, supabase, utils, constants, StatCard }) => {
    const { fetchAllData, getSundaysInQuarter, getQuarterDateRange } = utils;
    const { sessionsToSchedule } = constants;

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currQ = Math.ceil(currentMonth / 3);
    const defaultNextQ = currQ === 4 ? 1 : currQ + 1;
    const defaultNextY = currQ === 4 ? currentYear + 1 : currentYear;

    const [schedulingPhase, setSchedulingPhase] = useState('setup'); 
    const [appMode, setAppMode] = useState('schedule'); 
    const [activeSessionTab, setActiveSessionTab] = useState('第一堂'); 
    
    const [year, setYear] = useState(defaultNextY);
    const [quarter, setQuarter] = useState(defaultNextQ);
    const [queryYear, setQueryYear] = useState(defaultNextY);
    const [queryQuarter, setQueryQuarter] = useState(defaultNextQ);
    
    const [dbData, setDbData] = useState({ members: [], positions: [], memberPositions: [], existingSchedules: [], memberQuarterSettings: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [generatedDraft, setGeneratedDraft] = useState([]);
    const [errorMsg, setErrorMsg] = useState('');
    const [showSuccessToast, setShowSuccessToast] = useState(false);
    
    const [activeSlot, setActiveSlot] = useState(null); 
    const [searchTerm, setSearchTerm] = useState('');
    const [analysisSearchTerm, setAnalysisSearchTerm] = useState(''); 
    const [draggedItem, setDraggedItem] = useState(null);
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', currentName: '', currentDate: '', currentRole: '', newName: '', newDate: '', newRole: '', type: '', onConfirm: null });
    const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [sortConfig, setSortConfig] = useState({ key: 'totalService', direction: 'desc' });
    const [selectedPersonalStats, setSelectedPersonalStats] = useState(null);
    const [hasQuerySchedule, setHasQuerySchedule] = useState(true); 

    useEffect(() => { 
        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                const currentQuarterStr = `${year}-Q${quarter}`;
                const [{ data: members }, { data: positions }, { data: memberPositions }, { data: quarterSettings }] = await Promise.all([
                    fetchAllData(() => supabase.from('members').select('*')),
                    fetchAllData(() => supabase.from('positions').select('*')),
                    fetchAllData(() => supabase.from('member_positions').select('*').eq('quarter', currentQuarterStr)),
                    fetchAllData(() => supabase.from('member_quarter_settings').select('*').in('quarter', [currentQuarterStr, 'SYSTEM']))
                ]);
                setDbData({ 
                    members: members || [], positions: positions || [], memberPositions: memberPositions || [], 
                    existingSchedules: [], memberQuarterSettings: quarterSettings || []
                });
            } catch (err) { setErrorMsg('讀取資料庫失敗。請確保網路連線。'); } 
            finally { setIsLoading(false); }
        };
        fetchInitialData(); 
    }, [year, quarter]); 

    useEffect(() => {
        const checkScheduleExists = async () => {
            if (appMode !== 'query') return;
            try {
                const { data: memData } = await supabase.from('members').select('id').eq('name', 'SYSTEM_SCHEDULE_ARCHIVE').limit(1);
                if (memData && memData.length > 0) {
                    const targetQ = `${queryYear}-Q${queryQuarter}`;
                    const { data } = await supabase.from('member_quarter_settings').select('id').eq('member_id', memData[0].id).eq('quarter', targetQ).limit(1);
                    setHasQuerySchedule(data && data.length > 0);
                } else { setHasQuerySchedule(false); }
            } catch (e) { setHasQuerySchedule(true); }
        };
        checkScheduleExists();
    }, [queryYear, queryQuarter, appMode]);

    const currentQuarterStr = `${year}-Q${quarter}`;

    const effectiveMembers = useMemo(() => {
        return dbData.members
            .filter(m => m.name && !m.name.startsWith('SYSTEM_'))
            .map(m => {
                const qs = dbData.memberQuarterSettings.find(s => s.member_id === m.id && s.quarter === currentQuarterStr);
                return {
                    ...m,
                    availability_status: qs?.availability_status || m.availability_status || '可排班',
                    preferred_session: qs?.preferred_session || m.preferred_session || '皆可',
                    dual_service_pref: qs?.dual_service_pref ?? m.dual_service_pref ?? null,
                    unavailable_dates: qs?.unavailable_dates ? safeParseJSON(qs.unavailable_dates, []) : (m.unavailable_dates || [])
                };
            });
    }, [dbData.members, dbData.memberQuarterSettings, currentQuarterStr]);

    const effectiveMemberPositions = useMemo(() => {
        return dbData.memberPositions.filter(mp => (mp.quarter === currentQuarterStr || !mp.quarter) && mp.is_active !== false);
    }, [dbData.memberPositions, currentQuarterStr]);

    const runAutoSchedule = () => {
        const targetQuarterStr = `${year}-Q${quarter}`;
        const hasQuarterData = dbData.memberQuarterSettings.some(s => s.quarter === targetQuarterStr);
        if (!hasQuarterData) { setErrorMsg(`⚠️ 「同工資料中心」建立【${targetQuarterStr.replace('-','')}】季度資料，再進行預排！`); return; }

        setIsLoading(true);
        setTimeout(() => {
            try {
                if (window.ScheduleEngine) {
                    const params = { year, quarter, effectiveMembers, effectiveMemberPositions, dbData };
                    const draft = window.ScheduleEngine.generate(params);
                    setGeneratedDraft(draft);
                }
                setErrorMsg('');
                if (schedulingPhase === 'setup') setActiveSessionTab('第一堂');
                setSchedulingPhase('editor');
            } catch (e) { setErrorMsg('自動排班引擎執行失敗，請確認已載入排班引擎。'); } 
            finally { setIsLoading(false); }
        }, 300);
    };

    const runQuerySchedule = async () => {
        setIsLoading(true);
        try {
            const qY = queryYear; const qQ = queryQuarter; setYear(qY); setQuarter(qQ);
            const targetQuarter = `${qY}-Q${qQ}`;
            
            const [{ data: mData }, { data: pData }, { data: mpData }, { data: qsData }] = await Promise.all([
                fetchAllData(() => supabase.from('members').select('*')),
                fetchAllData(() => supabase.from('positions').select('*')),
                fetchAllData(() => supabase.from('member_positions').select('*').eq('quarter', targetQuarter)),
                fetchAllData(() => supabase.from('member_quarter_settings').select('*').in('quarter', [targetQuarter, 'SYSTEM']))
            ]);

            setDbData({ 
                members: mData || [], positions: pData || [], memberPositions: mpData || [], 
                existingSchedules: [], memberQuarterSettings: qsData || []
            });

            let activeSchedules = [];
            const archiveMem = (mData || []).find(m => m.name === 'SYSTEM_SCHEDULE_ARCHIVE');
            
            if (archiveMem) {
                const archiveQs = (qsData || []).find(q => q.member_id === archiveMem.id && q.quarter === targetQuarter);
                if (archiveQs && archiveQs.unavailable_dates) {
                    activeSchedules = safeParseJSON(archiveQs.unavailable_dates, []);
                }
            }

            if (!activeSchedules || activeSchedules.length === 0) {
                setErrorMsg(`⚠️ 尚未建立 ${targetQuarter} 排班資料，請至「預排作業」新增並發布。`); setIsLoading(false); return;
            }

            const reconstructed = [];
            const sundays = window.ScheduleEngine ? window.ScheduleEngine.getSundaysInQuarter(qY, qQ) : [];
            const roleLimits = { '司會': 1, 'PPT': 1, '主餐': 2, '收奉獻': 2, '接待': 2, '新朋友關懷': 2, '執事輪值': 1 };

            sundays.forEach(sunday => {
                const dateStr = window.ScheduleEngine ? window.ScheduleEngine.formatDate(sunday) : sunday.toISOString().split('T')[0];
                sessionsToSchedule.forEach(session => {
                    (pData || []).forEach(pos => {
                        const posName = (pos.name || '').trim();
                        if (!['司會', 'PPT', '主餐', '收奉獻', '接待', '新朋友關懷', '執事輪值'].includes(posName)) return;
                        if (posName === '主餐' && sunday.getDate() > 7) return; 

                        const maxPeople = pos.max_people || roleLimits[posName] || 1;
                        const existingForSlot = activeSchedules.filter(s => s.d === dateStr && s.s === session && s.p === posName);

                        existingForSlot.forEach(s => {
                            const member = (mData || []).find(m => m.id === s.m);
                            reconstructed.push({
                                temp_id: `DB_${s.m}_${Math.random()}`, service_date: dateStr, session: session, member_id: s.m, position_id: pos.id,
                                _memberName: member ? member.name : '未知同工', _positionName: posName, is_empty: false, is_emergency: 0
                            });
                        });
                        const missingCount = maxPeople - existingForSlot.length;
                        for (let i = 0; i < missingCount; i++) {
                            reconstructed.push({
                                temp_id: `EMPTY_${dateStr}_${session}_${pos.id}_${Math.random()}`, service_date: dateStr, session: session, member_id: 'EMPTY_SLOT', position_id: pos.id,
                                _memberName: '⚠️ 人工指派', _positionName: posName, is_empty: true
                            });
                        }
                    });
                });
            });

            setGeneratedDraft(reconstructed); setErrorMsg('');
            if (schedulingPhase === 'setup') setActiveSessionTab('第一堂');
            setSchedulingPhase('editor');
        } catch (error) { setErrorMsg('查詢班表失敗：' + error.message); } finally { setIsLoading(false); }
    };

    const currentUsageCount = useMemo(() => {
        const counts = {}; effectiveMembers.forEach(m => counts[m.id] = 0);
        generatedDraft.forEach(d => { if (!d.is_empty && counts[d.member_id] !== undefined) counts[d.member_id]++; });
        return counts;
    }, [effectiveMembers, generatedDraft]);

    const memberGroups = useMemo(() => {
        const map = {}; effectiveMembers.forEach(m => { if (m.group_id) map[m.id] = m.group_id; }); return map;
    }, [effectiveMembers]);

    const { conflictIds, orphanIds } = useMemo(() => {
        const conflicts = new Set(); const orphans = new Set();
        const shiftsByDate = {};
        generatedDraft.forEach(d => {
            if (d.is_empty) return;
            if (!shiftsByDate[d.service_date]) shiftsByDate[d.service_date] = [];
            shiftsByDate[d.service_date].push(d);
        });
        Object.values(shiftsByDate).forEach(dayShifts => {
            const freq = {}; const groupFreq = {};
            dayShifts.forEach(d => {
                freq[d.member_id] = (freq[d.member_id] || 0) + 1;
                const gid = memberGroups[d.member_id];
                if (gid && (gid.startsWith('FA') || gid.startsWith('FB'))) {
                    if (!groupFreq[gid]) groupFreq[gid] = new Set();
                    groupFreq[gid].add(d.member_id);
                }
            });
            dayShifts.forEach(d => {
                if (freq[d.member_id] >= 2) conflicts.add(d.temp_id);
                const gid = memberGroups[d.member_id];
                if (gid && groupFreq[gid] && groupFreq[gid].size < 2) orphans.add(d.temp_id);
            });
        });
        return { conflictIds: conflicts, orphanIds: orphans };
    }, [generatedDraft, memberGroups]);

    const handleDragStart = useCallback((e, item) => { setDraggedItem(item); e.currentTarget.classList.add('dragging'); }, []);
    const handleDragEnd = useCallback((e) => { e.currentTarget.classList.remove('dragging'); setDraggedItem(null); }, []);
    const handleDrop = useCallback((e, targetDate, targetSession, targetPosName, targetIdx) => {
        e.preventDefault();
        if (!draggedItem) return;
        if (draggedItem.service_date !== targetDate || draggedItem.session !== targetSession || draggedItem._positionName !== targetPosName) return;
        setGeneratedDraft(prev => {
            const newDraft = [...prev];
            const group = newDraft.filter(d => d.service_date === targetDate && d.session === targetSession && d._positionName === targetPosName);
            if(!group[targetIdx]) return prev;
            const sIdx = newDraft.findIndex(d => d.temp_id === draggedItem.temp_id);
            const tIdx = newDraft.findIndex(d => d.temp_id === group[targetIdx].temp_id);
            const temp = newDraft[sIdx]; newDraft[sIdx] = newDraft[tIdx]; newDraft[tIdx] = temp;
            return newDraft;
        });
    }, [draggedItem]);

    const handleSubstitute = (newMember) => {
        if (!activeSlot || !newMember) return;
        setGeneratedDraft(prev => prev.map(d => {
            if (activeSlot._positionName === '執事輪值' && d.service_date === activeSlot.service_date && d._positionName === '執事輪值' && d.member_id === activeSlot.member_id) {
                return { ...d, member_id: newMember.id, _memberName: newMember.name, is_empty: false, is_emergency: 0 };
            }
            if (d.temp_id === activeSlot.temp_id) return { ...d, member_id: newMember.id, _memberName: newMember.name, is_empty: false, is_emergency: 0 };
            return d;
        }));
        setActiveSlot(null); setSearchTerm('');
    };

    const handleSwap = (newMember, targetShift) => {
        if (!activeSlot || !newMember || !targetShift) return;
        setGeneratedDraft(prev => prev.map(d => {
            if (activeSlot._positionName === '執事輪值') {
                if (d.service_date === activeSlot.service_date && d._positionName === '執事輪值' && d.member_id === activeSlot.member_id) {
                    return { ...d, member_id: newMember.id, _memberName: newMember.name, is_empty: false, is_emergency: 0 };
                }
            } else if (d.temp_id === activeSlot.temp_id) {
                return { ...d, member_id: newMember.id, _memberName: newMember.name, is_empty: false, is_emergency: 0 };
            }
            if (targetShift.isDeaconGroup) {
                if (d.service_date === targetShift.service_date && d._positionName === '執事輪值' && d.member_id === newMember.id) {
                    return { ...d, member_id: activeSlot.member_id, _memberName: activeSlot._memberName };
                }
            } else if (d.temp_id === targetShift.temp_id) {
                return { ...d, member_id: activeSlot.member_id, _memberName: activeSlot._memberName };
            }
            return d;
        }));
        setActiveSlot(null); setSearchTerm('');
    };

    const requestSubstitute = (newMember) => {
        const cDate = activeSlot.service_date.replace(/-/g,'/');
        const cRole = activeSlot._positionName === '執事輪值' ? activeSlot._positionName : `${activeSlot.session}‧${activeSlot._positionName}`;
        setConfirmDialog({
            isOpen: true, title: '執行替補', currentName: activeSlot._memberName, currentDate: cDate, currentRole: cRole,
            newName: newMember.name, newDate: cDate, newRole: cRole, type: 'substitute',
            onConfirm: () => { handleSubstitute(newMember); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }
        });
    };

    const requestSwap = (newMember, targetShift) => {
        const cDate = activeSlot.service_date.replace(/-/g,'/');
        const cRole = activeSlot._positionName === '執事輪值' ? activeSlot._positionName : `${activeSlot.session}‧${activeSlot._positionName}`;
        
        const nDate = targetShift.service_date.replace(/-/g,'/');
        const nRole = targetShift._positionName === '執事輪值' ? targetShift._positionName : `${targetShift.session}‧${targetShift._positionName}`;
        
        setConfirmDialog({
            isOpen: true, title: '執行換班', currentName: activeSlot._memberName, currentDate: cDate, currentRole: cRole,
            newName: newMember.name, newDate: nDate, newRole: nRole, type: 'swap',
            onConfirm: () => { handleSwap(newMember, targetShift); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }
        });
    };

    const recommendations = useMemo(() => {
        if (!activeSlot) return [];
        const { service_date, session, position_id, member_id } = activeSlot;
        const eligibleIds = effectiveMemberPositions.filter(mp => mp.position_id === position_id).map(mp => mp.member_id);
        const requesterPositions = effectiveMemberPositions.filter(mp => mp.member_id === member_id).map(mp => mp.position_id);
        const todayStr = window.ScheduleEngine ? window.ScheduleEngine.formatDate(new Date()) : new Date().toISOString().split('T')[0];

        let filtered = effectiveMembers.filter(m => {
            if (m.id === member_id) return false;
            if (!eligibleIds.includes(m.id)) return false;
            const status = (m.availability_status || '').trim();
            if (status === '暫停服事' || status === '安息季') return false;
            if (m.unavailable_dates && m.unavailable_dates.includes(service_date)) return false;
            
            const mShiftsToday = generatedDraft.filter(d => d.service_date === service_date && d.member_id === m.id);
            const activeRole = activeSlot._positionName;

            if (activeRole === '執事輪值') {
                if (mShiftsToday.length > 0) return false; 
            } else {
                if (mShiftsToday.some(d => d._positionName === '執事輪值')) return false;

                const rawPref = m.dual_service_pref;
                const dualPref = (rawPref === null || rawPref === undefined || rawPref === '') ? null : parseInt(rawPref);

                const shiftsThisSession = mShiftsToday.filter(d => d.session === session);
                if (shiftsThisSession.length > 0) {
                    if (dualPref === 0) return false; 

                    const concurrentRoles = ['接待', '收奉獻', '主餐', '新朋友關懷'];
                    if (!concurrentRoles.includes(activeRole)) return false;
                    const allExistingAreConcurrent = shiftsThisSession.every(d => concurrentRoles.includes(d._positionName));
                    if (!allExistingAreConcurrent) return false;
                    if (shiftsThisSession.some(d => d._positionName === activeRole)) return false;
                }
                const shiftsOtherSession = mShiftsToday.filter(d => d.session !== session);
                if (shiftsOtherSession.length > 0) {
                    if (dualPref === 0 || dualPref === null) return false; 
                    const otherRoles = shiftsOtherSession.map(d => d._positionName);
                    if (dualPref === 1 && !otherRoles.includes(activeRole)) return false; 
                    if (dualPref === 2 && otherRoles.includes(activeRole)) return false;  
                } else {
                    if ((dualPref === 0 || dualPref === null) && m.preferred_session && m.preferred_session !== '皆可') {
                        if (!m.preferred_session.includes(session.replace('堂', ''))) return false;
                    }
                }
            }
            return true;
        }).map(m => {
            const candidateShifts = generatedDraft.filter(d => d.member_id === m.id);
            let swapOptions = [];
            const processedDeaconDates = new Set();
            candidateShifts.forEach(shift => {
                if (!requesterPositions.includes(shift.position_id)) return; 
                if (shift.service_date < todayStr) return;
                if (shift._positionName === '執事輪值') {
                    if (processedDeaconDates.has(shift.service_date)) return;
                    processedDeaconDates.add(shift.service_date);
                    const requesterRolesToday = generatedDraft.filter(d => d.member_id === member_id && d.service_date === shift.service_date).map(d => d._positionName);
                    if (requesterRolesToday.includes('執事輪值')) return;
                    swapOptions.push({ isDeaconGroup: true, service_date: shift.service_date, _positionName: '執事輪值', session: '第一堂、第二堂' });
                } else {
                    const requesterRolesThisSession = generatedDraft.filter(d => d.member_id === member_id && d.service_date === shift.service_date && d.session === shift.session).map(d => d._positionName);
                    if (requesterRolesThisSession.includes(shift._positionName)) return;
                    swapOptions.push(shift);
                }
            });
            return { ...m, usage: currentUsageCount[m.id] || 0, swapOptions };
        });
        return filtered.sort((a, b) => a.usage - b.usage);
    }, [activeSlot, effectiveMembers, effectiveMemberPositions, generatedDraft, currentUsageCount]);

    const finalRecommendations = useMemo(() => {
        if (!searchTerm) return recommendations;
        const lowerTerm = searchTerm.toLowerCase();
        return recommendations.filter(c => {
            if ((c.name || '').toLowerCase().includes(lowerTerm)) return true;
            if (c.swapOptions && c.swapOptions.some(swap => (swap._positionName || '').toLowerCase().includes(lowerTerm))) return true;
            return false;
        });
    }, [recommendations, searchTerm]);

    const handlePublishClick = () => {
        const hasEmpty = generatedDraft.some(d => d.is_empty);
        if (hasEmpty) { setErrorMsg('還有「⚠️ 人工指派」的空缺未填補，完成後再發布。'); return; }
        setPublishConfirmOpen(true);
    };

    const executePublish = async () => {
        setPublishConfirmOpen(false); setIsSaving(true);
        try {
            const archiveName = 'SYSTEM_SCHEDULE_ARCHIVE';
            let archiveMem = dbData.members.find(m => m.name === archiveName);
            if (!archiveMem) {
                const { data: newMem, error: insErr } = await supabase.from('members').insert({ name: archiveName }).select();
                if (insErr) throw insErr; archiveMem = newMem[0];
            }

            const scheduleData = generatedDraft.filter(d => !d.is_empty).map(d => ({
                d: d.service_date, s: d.session, p: d._positionName, m: d.member_id
            }));

            const { error: qsErr = null } = await supabase.from('member_quarter_settings').upsert({
                member_id: archiveMem.id, quarter: `${year}-Q${quarter}`, unavailable_dates: scheduleData, availability_status: '系統備份檔'
            }, { onConflict: 'member_id, quarter' });

            if (qsErr) throw qsErr;
            setShowSuccessToast(true); setTimeout(() => setShowSuccessToast(false), 3000);
        } catch (err) { setErrorMsg('儲存失敗：' + err.message); } 
        finally { setIsSaving(false); }
    };

    const exportToCSV = () => {
        const tableData = {};
        generatedDraft.forEach(d => {
            if (!d.service_date || !d.session) return;
            const key = `${d.service_date}_${d.session}`;
            if (!tableData[key]) tableData[key] = { date: d.service_date, session: d.session, positions: {} };
            if (!tableData[key].positions[d._positionName]) tableData[key].positions[d._positionName] = [];
            tableData[key].positions[d._positionName].push(d.is_empty ? '⚠️空缺' : (d._memberName || '未知'));
        });
        
        const sortedRows = Object.values(tableData).sort((a, b) => {
            if (a.session !== b.session) {
                if (a.session === '第一堂') return -1;
                if (b.session === '第一堂') return 1;
                return a.session.localeCompare(b.session);
            }
            return a.date.localeCompare(b.date);
        });

        let csvContent = '\uFEFF日期,堂別,司會,執事,接待,收奉獻,主餐,PPT,新朋友關懷\n';
        sortedRows.forEach(row => {
            const r = [
                row.date, row.session,
                (row.positions['司會'] || []).join('、'), (row.positions['執事輪值'] || []).join('、'),
                (row.positions['接待'] || []).join('、'), (row.positions['收奉獻'] || []).join('、'),
                (row.positions['主餐'] || []).join('、'), (row.positions['PPT'] || []).join('、'),
                (row.positions['新朋友關懷'] || []).join('、')
            ];
            csvContent += r.map(v => `"${v}"`).join(',') + '\n';
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `TBC_排班表_${year}Q${quarter}.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const dashboardData = useMemo(() => {
        const memberStats = {};
        effectiveMembers.forEach(m => {
            const status = (m.availability_status || '').trim();
            if (status === '暫停服事' || status === '安息季') return;
            memberStats[m.id] = { id: m.id, name: m.name, group: m.group_id, totalService: 0, attendanceDates: new Set(), roles: { '司會': 0, '執事輪值': 0, '接待': 0, '收奉獻': 0, '主餐': 0, 'PPT': 0, '新朋友關懷': 0 } };
        });
        generatedDraft.forEach(d => {
            if (d.is_empty || !memberStats[d.member_id]) return;
            const stats = memberStats[d.member_id];
            if(d.service_date) stats.attendanceDates.add(d.service_date);
            stats.totalService += 1;
            if (d._positionName && stats.roles[d._positionName] !== undefined) stats.roles[d._positionName] += 1;
        });
        return Object.values(memberStats).map(d => ({ ...d, attendance: d.attendanceDates.size, distinctRolesCount: Object.values(d.roles).filter(c => c > 0).length, healthScore: 0 })); 
    }, [generatedDraft, effectiveMembers]);

    const dashboardStats = useMemo(() => {
        if (!dashboardData || dashboardData.length === 0) return null;
        const totalMembers = dashboardData.length;
        const totalServices = dashboardData.reduce((sum, d) => sum + d.totalService, 0);
        const totalAttendance = dashboardData.reduce((sum, d) => sum + d.attendance, 0);
        const avgService = totalMembers ? (totalServices / totalMembers) : 0;
        const avgAttendance = totalMembers ? (totalAttendance / totalMembers) : 0;
        const variance = dashboardData.reduce((sum, d) => sum + Math.pow(d.totalService - avgService, 2), 0) / totalMembers;
        const stdDev = Math.sqrt(variance);
        const highRiskThreshold = Math.max(8, avgService + stdDev * 1.5);
        const highRiskMembers = dashboardData.filter(d => d.totalService >= highRiskThreshold);
        const attentionMembers = dashboardData.filter(d => d.totalService >= avgService + stdDev && d.totalService < highRiskThreshold);
        const maxService = Math.max(0, ...dashboardData.map(d => d.totalService));
        const roleCounts = {};
        dashboardData.forEach(d => { Object.keys(d.roles).forEach(role => { roleCounts[role] = (roleCounts[role] || 0) + d.roles[role]; }); });
        dashboardData.forEach(d => {
            if (d.totalService >= highRiskThreshold) d.healthStatus = 'danger';
            else if (d.totalService >= avgService + stdDev) d.healthStatus = 'warning';
            else d.healthStatus = 'healthy';
        });

        const attendanceDistObj = {}; const serviceDistObj = {};
        dashboardData.forEach(d => {
            attendanceDistObj[d.attendance] = (attendanceDistObj[d.attendance] || 0) + 1;
            serviceDistObj[d.totalService] = (serviceDistObj[d.totalService] || 0) + 1;
        });
        const maxAttCount = Math.max(0, ...Object.values(attendanceDistObj));
        const maxSrvCount = Math.max(0, ...Object.values(serviceDistObj));

        return { totalMembers, totalServices, avgService: avgService.toFixed(1), avgAttendance: avgAttendance.toFixed(1), stdDev: stdDev.toFixed(2), maxService, highRiskMembers, attentionMembers, roleCounts, attendanceDistObj, serviceDistObj, maxAttCount, maxSrvCount };
    }, [dashboardData]);

    const sortedDashboardData = useMemo(() => {
        if (!dashboardData) return [];
        let sortableItems = [...dashboardData];
        if (analysisSearchTerm) {
            const term = analysisSearchTerm.toLowerCase();
            sortableItems = sortableItems.filter(d => (d.name || '').toLowerCase().includes(term));
        }
        sortableItems.sort((a, b) => {
            let aValue = sortConfig.key === 'name' ? (a.name || '') : (sortConfig.key === 'totalService' ? a.totalService : (sortConfig.key === 'attendance' ? a.attendance : a.roles[sortConfig.key] || 0));
            let bValue = sortConfig.key === 'name' ? (b.name || '') : (sortConfig.key === 'totalService' ? b.totalService : (sortConfig.key === 'attendance' ? b.attendance : b.roles[sortConfig.key] || 0));
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            if (sortConfig.key !== 'totalService') return b.totalService - a.totalService;
            return 0;
        });
        return sortableItems;
    }, [dashboardData, sortConfig, analysisSearchTerm]); 

    const requestSort = (key) => {
        let direction = 'desc'; if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
        setSortConfig({ key, direction });
    };

    const renderOriginalDataAnalysis = () => {
        if (!dashboardStats) return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 font-medium bg-slate-50">
                <Database size={48} className="mb-4 opacity-50 text-slate-400" />
                <p>尚無可分析的排班資料，請先至「排班作業」建立或載入班表。</p>
            </div>
        );
        return (
            <div className="h-full overflow-y-auto custom-scrollbar p-6 lg:p-8 animate-fade-in pb-20 bg-slate-50">
                <div className="flex flex-col xl:flex-row gap-6 mb-8">
                    <div className="grid grid-cols-2 gap-4 xl:w-[400px] shrink-0">
                        <StatCard compact icon={Users} title="排班總人數" value={dashboardStats.totalMembers} unit="人" iconBgClass="bg-indigo-50" iconTextClass="text-indigo-600" />
                        <StatCard compact icon={TrendingUp} title="最高服事次數" value={dashboardStats.maxService} unit="次" iconBgClass="bg-rose-50" iconTextClass="text-rose-600" />
                        <StatCard compact icon={Layers} title="平均服事次數" value={dashboardStats.avgService} unit="次/季" iconBgClass="bg-emerald-50" iconTextClass="text-emerald-600" />
                        <StatCard compact icon={CalendarDays} title="平均出席天數" value={dashboardStats.avgAttendance} unit="天/季" iconBgClass="bg-sky-50" iconTextClass="text-sky-600" />
                    </div>
                    
                    <div className="flex-1 flex flex-col sm:flex-row gap-4 overflow-hidden">
                        <div className="bg-white p-5 rounded-xl shadow-soft border border-slate-100 flex-1 flex flex-col min-h-[160px] transform hover:rotate-x-[2deg] hover:rotate-y-[-4deg] transition-transform duration-300">
                            <h4 className="text-[13px] font-bold text-slate-500 mb-3 flex items-center gap-1.5"><BarChart3 size={14} className="text-sky-500"/> 服事天數分布圖</h4>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-2">
                                {Object.keys(dashboardStats.attendanceDistObj).map(Number).sort((a,b)=>a-b).map(k => {
                                    const count = dashboardStats.attendanceDistObj[k];
                                    const pct = dashboardStats.maxAttCount > 0 ? (count / dashboardStats.maxAttCount) * 100 : 0;
                                    return (
                                        <div key={k} className="flex items-center gap-2">
                                            <div className="w-10 text-right font-medium text-slate-500 text-[11px] shrink-0">{k} 天</div>
                                            <div className="flex-1 flex items-center h-5">
                                                <div className="h-full bg-gradient-to-r from-sky-400 to-sky-500 rounded-r-md transition-all shadow-sm" style={{ width: `${pct}%`, minWidth: count > 0 ? '4px' : '0' }}></div>
                                                <span className="ml-2 font-bold text-slate-600 text-[11px]">{count} 人</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-soft border border-slate-100 flex-1 flex flex-col min-h-[160px] transform hover:rotate-x-[2deg] hover:rotate-y-[4deg] transition-transform duration-300">
                            <h4 className="text-[13px] font-bold text-slate-500 mb-3 flex items-center gap-1.5"><BarChart3 size={14} className="text-emerald-500"/> 服事次數分布圖</h4>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-2">
                                {Object.keys(dashboardStats.serviceDistObj).map(Number).sort((a,b)=>a-b).map(k => {
                                    const count = dashboardStats.serviceDistObj[k];
                                    const pct = dashboardStats.maxSrvCount > 0 ? (count / dashboardStats.maxSrvCount) * 100 : 0;
                                    return (
                                        <div key={k} className="flex items-center gap-2">
                                            <div className="w-10 text-right font-medium text-slate-500 text-[11px] shrink-0">{k} 次</div>
                                            <div className="flex-1 flex items-center h-5">
                                                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-r-md transition-all shadow-sm" style={{ width: `${pct}%`, minWidth: count > 0 ? '4px' : '0' }}></div>
                                                <span className="ml-2 font-bold text-slate-600 text-[11px]">{count} 人</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="bg-white rounded-xl shadow-soft border border-slate-100 overflow-hidden mb-8 flex flex-col max-h-[600px]">
                    <div className="p-6 lg:px-8 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0">
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><LayoutList className="text-indigo-600" size={20} /> 同工排班分析表</h3>
                        <div className="relative w-full sm:w-64">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="搜尋姓名..." value={analysisSearchTerm} onChange={e => setAnalysisSearchTerm(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-sm" />
                            {analysisSearchTerm && <button onClick={() => setAnalysisSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:bg-slate-200 rounded-lg transition-all"><X size={14} /></button>}
                        </div>
                    </div>
                    <div className="overflow-x-auto custom-scrollbar flex-1">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead className="sticky top-0 bg-white/95 backdrop-blur shadow-sm z-10">
                                <tr>
                                    <th onClick={() => requestSort('name')} className="py-4 px-4 font-medium text-slate-500 text-sm whitespace-nowrap pl-8 border-b border-slate-100 cursor-pointer hover:bg-slate-50 select-none">姓名 <ArrowUpDown size={14} className="inline ml-1 opacity-40"/></th>
                                    <th onClick={() => requestSort('totalService')} className="py-4 px-4 font-medium text-slate-500 text-sm whitespace-nowrap border-b border-slate-100 text-center cursor-pointer hover:bg-slate-50">服事次數 <ArrowUpDown size={14} className="inline ml-1 opacity-40"/></th>
                                    <th onClick={() => requestSort('attendance')} className="py-4 px-4 font-medium text-slate-500 text-sm whitespace-nowrap border-b border-slate-100 text-center cursor-pointer hover:bg-slate-50">出席天數 <ArrowUpDown size={14} className="inline ml-1 opacity-40"/></th>
                                    {['司會', '執事輪值', '接待', '收奉獻', '主餐', 'PPT', '新朋友關懷'].map(role => (
                                        <th key={role} onClick={() => requestSort(role)} className="py-4 px-4 font-medium text-slate-500 text-sm whitespace-nowrap border-b border-slate-100 text-center cursor-pointer hover:bg-slate-50">{role} <ArrowUpDown size={14} className="inline ml-1 opacity-40"/></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedDashboardData.map((d, i) => (
                                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3 px-4 pl-8 whitespace-nowrap"><p className="font-bold text-slate-900 text-base">{d.name}</p></td>
                                        <td className="py-3 px-4 text-center font-bold text-indigo-600 bg-indigo-50/30">{d.totalService}</td>
                                        <td className="py-3 px-4 text-center font-medium text-slate-600">{d.attendance}</td>
                                        {['司會', '執事輪值', '接待', '收奉獻', '主餐', 'PPT', '新朋友關懷'].map(role => (
                                            <td key={role} className="py-3 px-4 text-center font-normal text-slate-400">{d.roles[role] || '-'}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="bg-white p-8 lg:p-10 rounded-xl shadow-soft border border-slate-100">
                    <h3 className="text-xl font-bold text-slate-900 mb-8">🛠️ 本季崗位需求 <span className="text-sm text-slate-500 font-medium ml-2">(合計：{dashboardStats.totalServices} 次)</span></h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                        {Object.entries(dashboardStats.roleCounts).sort((a,b) => b[1] - a[1]).map(([role, count]) => {
                            const pct = dashboardStats.totalServices ? ((count / dashboardStats.totalServices) * 100).toFixed(1) : 0;
                            return (
                                <div key={role} className="flex items-center gap-4">
                                    <div className="w-24 text-right font-medium text-slate-700 text-sm">{role}</div>
                                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden flex items-center"><div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-1000 shadow-sm" style={{ width: `${pct}%` }}></div></div>
                                    <div className="w-20 text-sm font-normal text-slate-500">{count} 次 <span className="text-[10px] opacity-60">({pct}%)</span></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderSchedulingView = () => {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 p-6 animate-fade-in overflow-y-auto">
                <div className="w-full max-w-xl bg-white p-10 lg:p-12 rounded-2xl shadow-soft border border-slate-100 relative">
                    <div className="flex bg-slate-100 p-1.5 rounded-xl mb-8">
                        <button onClick={() => setAppMode('schedule')} className={`flex-1 py-3.5 flex items-center justify-center gap-2 text-sm font-medium rounded-lg transition-all ${appMode === 'schedule' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'}`}><Play size={18} /> 預排作業</button>
                        <button onClick={() => setAppMode('query')} className={`flex-1 py-3.5 flex items-center justify-center gap-2 text-sm font-medium rounded-lg transition-all ${appMode === 'query' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'}`}><Search size={18} /> 編輯班表</button>
                    </div>
                    {appMode === 'schedule' ? (
                        <div className="animate-fade-in">
                            <div className="grid grid-cols-2 gap-6 mb-10">
                                <div className="space-y-2"><label className="text-xs font-medium text-slate-500 ml-2">年份</label><input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-normal text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" /></div>
                                <div className="space-y-2"><label className="text-xs font-medium text-slate-500 ml-2">季度</label><select value={quarter} onChange={e => setQuarter(parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-normal text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"><option value={1}>Q1 (1-3月)</option><option value={2}>Q2 (4-6月)</option><option value={3}>Q3 (7-9月)</option><option value={4}>Q4 (10-12月)</option></select></div>
                            </div>
                            <button onClick={runAutoSchedule} disabled={isLoading} className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-button hover:-translate-y-0.5">{isLoading ? <RefreshCw className="animate-spin" /> : <><Play size={20} fill="currentColor"/> 建立新班表</>}</button>
                            {!dbData.memberQuarterSettings.some(s => s.quarter === `${year}-Q${quarter}`) && !isLoading && (
                                <p className="text-rose-500 text-[13px] font-medium text-center mt-4 flex items-center justify-center gap-1.5 animate-pulse"><AlertCircle size={16} /> 尚未建立 {year}Q{quarter} 同工資料，請至「同工資料中心」新增。</p>
                            )}
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            <div className="grid grid-cols-2 gap-6 mb-10">
                                <div className="space-y-2"><label className="text-xs font-medium text-slate-500 ml-2">年份</label><input type="number" value={queryYear} onChange={e => setQueryYear(parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-normal text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" /></div>
                                <div className="space-y-2"><label className="text-xs font-medium text-slate-500 ml-2">季度</label><select value={queryQuarter} onChange={e => setQueryQuarter(parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-normal text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"><option value={1}>Q1 (1-3月)</option><option value={2}>Q2 (4-6月)</option><option value={3}>Q3 (7-9月)</option><option value={4}>Q4 (10-12月)</option></select></div>
                            </div>
                            <button onClick={runQuerySchedule} disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 disabled:from-indigo-300 disabled:to-violet-300 text-white font-medium py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-button hover:-translate-y-0.5">{isLoading ? <RefreshCw className="animate-spin" /> : <><Search size={20} strokeWidth={3}/> 開始編輯</>}</button>
                            {!hasQuerySchedule && !isLoading && (
                                <p className="text-rose-500 text-[13px] font-medium text-center mt-4 flex items-center justify-center gap-1.5 animate-pulse"><AlertCircle size={16} /> 尚未建立 {queryYear}Q{queryQuarter} 排班資料，請至「預排作業」新增。</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderRecommendationPanel = () => {
        if (!activeSlot) return null;
        return (
            <div className="w-full lg:w-[400px] xl:w-[450px] shrink-0 bg-white border-l border-slate-200 overflow-hidden h-full flex flex-col shadow-soft z-20 animate-panel-right relative">
                <div className="bg-slate-900 px-5 py-4 rounded-b-[1.25rem] shadow-sm border-b border-slate-800 relative z-20 shrink-0 overflow-hidden">
                    <div className="absolute top-[-20%] right-[-10%] w-40 h-40 rounded-full bg-violet-600/30 blur-3xl pointer-events-none"></div>
                    <button onClick={() => { setActiveSlot(null); setSearchTerm(''); }} className="absolute right-4 top-4 z-50 p-1.5 rounded-lg text-slate-300 transition-colors duration-75 hover:bg-white/20 hover:text-white cursor-pointer active:scale-95"><X size={18}/></button>
                    <div className="flex items-center gap-3 relative z-10 pr-6">
                        <div className={`p-2.5 rounded-lg shrink-0 ${activeSlot.is_empty ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10 text-indigo-300'}`}><Calendar size={20} /></div>
                        <div className="flex flex-col gap-1 w-full">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-bold text-white leading-none">{activeSlot.service_date}</p>
                                <span className={`px-2 py-0.5 rounded-md text-
