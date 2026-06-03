// ARIKA v195 - main script externalized to avoid JavaScript text appearing in page
        // MENGGUNAKAN TAUTAN TERBARU ANDA
        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzsIiJU-C0cwKya-7H3hk0uAqBmWaV7xHc7WanWDszOSwag89mAjTOlSFmPPhjSjbS_/exec';
        
        const firebaseConfigRaw = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        const appIdRaw = typeof __app_id !== 'undefined' ? __app_id : 'arika-bpom-ambon';
        const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        // --- GLOBAL STATES ---
        window.masterPegawai = [];
        window.arikaData = [];
        window.pengumumanData = [];
        window.rencanaData = [];
        window.surveiData = [];
        window.agendaData = [];
        window.kalenderLiburData = [];
        window.agendaSelectedNips = [];
        window.currentUser = null;
        window.isAdmin = false;
        window.userRole = 'Pegawai';
        window.isReviewer = false;
        window.chartS = null;
        window.chartTrendInstance = null; // Selesaikan issue chart duplicate re-render
        window.editingJurnalId = null;
        window.editingJurnalOriginal = null;

        // Session dibuat lokal agar aman untuk Google Sites/file lokal, tanpa ketergantungan Firebase.
        let auth = null, db = null;
        window.appId = appIdRaw;
        
        // Selesaikan ReferenceError: filtered is not defined
        let filtered = [];
        window.personalHistoryPage = 1;
        window.personalHistorySignature = '';
        window.adminHistoryPage = 1;
        window.adminHistorySignature = '';
        window.adminAllPage = 1;
        window.adminAllSignature = '';
        const ARIKA_HISTORY_PAGE_SIZE = (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) ? 5 : 10;

        // --- DAFTAR HARI LIBUR NASIONAL 2026 ---
        const liburNasional = ["2026-01-01","2026-02-17","2026-03-20","2026-03-21","2026-03-22","2026-04-03","2026-05-01","2026-05-14","2026-05-27","2026-06-01","2026-07-19","2026-08-17","2026-09-16","2026-12-25"];

        // --- HELPER UNTUK TANGGAL & MAPPING ---
        const getDayName = (dateStr) => {
            if (!dateStr) return "";
            const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            return days[new Date(dateStr).getDay()];
        };

        const formatDateIndo = (dateStr) => {
            if (!dateStr) return "";
            const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            const d = new Date(dateStr);
            return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
        };

        const formatHariTanggal = (dateStr) => {
            if (!dateStr) return "-";
            return `${getDayName(dateStr)}, ${formatDateIndo(dateStr)}`;
        };

        const normalize = (str) => String(str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');


        const ARIKA_DELETED_JURNAL_TOMBSTONE_KEY = 'arika_deleted_jurnal_tombstones_v1';
        const ARIKA_DELETED_JURNAL_TOMBSTONE_MAX_AGE = 3 * 60 * 1000;

        function readJurnalDeleteTombstones() {
            const now = Date.now();
            let map = {};
            try {
                map = JSON.parse(localStorage.getItem(ARIKA_DELETED_JURNAL_TOMBSTONE_KEY) || '{}') || {};
            } catch(_) { map = {}; }
            let changed = false;
            Object.keys(map).forEach(key => {
                if(!map[key] || (now - Number(map[key])) > ARIKA_DELETED_JURNAL_TOMBSTONE_MAX_AGE) {
                    delete map[key];
                    changed = true;
                }
            });
            if(changed) {
                try { localStorage.setItem(ARIKA_DELETED_JURNAL_TOMBSTONE_KEY, JSON.stringify(map)); } catch(_) {}
            }
            return map;
        }

        function writeJurnalDeleteTombstones(map) {
            try { localStorage.setItem(ARIKA_DELETED_JURNAL_TOMBSTONE_KEY, JSON.stringify(map || {})); } catch(_) {}
        }

        function buildJurnalDeleteKeys(row = {}) {
            const keys = [];
            const id = String(row.id || row.ID || '').trim();
            if(id) keys.push(`id:${id}`);
            const name = normalize(row.name || row.nama || row.pelaksana || row.namaPegawai || window.currentUser?.nama || '');
            const date = String(row.date || row.tanggal || '').trim();
            const desc = normalize(row.desc || row.deskripsi || row.kegiatan || row.catatan || '');
            if(name && date && desc) keys.push(`row:${name}|${date}|${desc}`);
            return keys;
        }

        function markJurnalAsLocallyDeleted(row = {}) {
            const map = readJurnalDeleteTombstones();
            const now = Date.now();
            buildJurnalDeleteKeys(row).forEach(key => { map[key] = now; });
            writeJurnalDeleteTombstones(map);
        }

        function isJurnalLocallyDeleted(row = {}) {
            const map = readJurnalDeleteTombstones();
            return buildJurnalDeleteKeys(row).some(key => !!map[key]);
        }

        function applyJurnalDeleteTombstones(rows = []) {
            return (rows || []).filter(row => !isJurnalLocallyDeleted(row));
        }

        function jurnalMatchesDeleteTarget(row = {}, target = {}) {
            const rowId = String(row.id || '').trim();
            const targetId = String(target.id || '').trim();
            if(rowId && targetId && rowId === targetId) return true;
            return String(row.date || '') === String(target.date || '')
                && normalize(row.desc) === normalize(target.desc)
                && (!target.name || normalize(row.name) === normalize(target.name));
        }

        function canonicalLabKey(value) {
            const raw = String(value || '').toLowerCase();
            const key = normalize(value);

            if(!key || key === 'semua' || key === 'semualab') return 'semua';
            if(key.includes('mikrobiologi')) return 'mikrobiologi';
            if(key.includes('pangan')) return 'kimiapangan';
            if(key.includes('kosmetik')) return 'kimiakosmetik';
            if(key.includes('obnaz') || raw.includes('obat dan narkotika') || raw.includes('narkotika')) return 'kimiaobnaz';
            if(key.includes('kimiaoba') || key.includes('oba') || raw.includes('obat bahan alam')) return 'kimiaoba';

            return key;
        }

        function labMatches(rowLab, selectedLab) {
            if(!selectedLab || selectedLab === 'Semua') return true;
            const rowKey = canonicalLabKey(rowLab);
            const selectedKey = canonicalLabKey(selectedLab);
            if(selectedKey === 'semua') return true;
            if(rowKey === selectedKey) return true;

            const rowNorm = normalize(rowLab);
            const selectedNorm = normalize(selectedLab);
            return rowNorm.includes(selectedNorm) || selectedNorm.includes(rowNorm);
        }

        function getNameTokenSet(value) {
            return new Set(String(value || '')
                .toLowerCase()
                .replace(/[,.;:()\[\]{}]/g, ' ')
                .split(/\s+/)
                .map(token => normalize(token))
                .filter(token => token && token.length >= 3 && !['dr','dra','apt','sp','si','se','skm','sfarm','farm','mkm','mkes','msi','st'].includes(token)));
        }

        function getRowSearchText(row) {
            if(!row) return '';
            try {
                return Object.values(row).map(v => String(v || '')).join(' ');
            } catch(e) {
                return '';
            }
        }

        function findPossibleNameInRawRow(row) {
            const possible = [
                'name', 'nama', 'pelaksana', 'nama pegawai', 'nama_pegawai',
                'nama pelaksana', 'pelaksana kegiatan', 'nama pelaksana kegiatan',
                'pegawai', 'personil', 'nama lengkap', 'nama petugas',
                'petugas', 'user', 'pengisi', 'dibuat oleh', 'created by'
            ];
            const val = getVal(row, possible);
            if(val) return String(val || '');
            return '';
        }

        function personMatchesRow(row, user = window.currentUser) {
            if(!row || !user) return false;

            const userNip = normalize(user.nip || '');
            const rowNip = normalize(row.nip || '');
            const rawText = getRowSearchText(row);
            const rawTextNorm = normalize(rawText);

            // Prioritas NIP: cocok langsung dari kolom NIP atau dari seluruh teks baris.
            if(userNip && rowNip && userNip === rowNip) return true;
            if(userNip && rawTextNorm.includes(userNip)) return true;

            const userName = normalize(user.nama || '');
            const rowNameSource = row.name || row.nama || row.pelaksana || findPossibleNameInRawRow(row);
            const rowName = normalize(rowNameSource);
            if(!userName) return false;

            if(rowName) {
                if(userName === rowName) return true;
                if(userName.includes(rowName) || rowName.includes(userName)) return true;
            }

            const userTokens = getNameTokenSet(user.nama);
            const rowTokens = getNameTokenSet(rowNameSource || rawText);
            let overlap = 0;
            userTokens.forEach(token => {
                if(rowTokens.has(token)) overlap += 1;
            });

            // Untuk kasus nama di Sheet hanya "Hellena", sedangkan master pegawai "Hellena Arvinda".
            if(overlap >= 1 && Math.min(userTokens.size, rowTokens.size) <= 2) return true;

            // Fallback terakhir: jika token penting nama user muncul di seluruh isi baris.
            // Ini menangani header Sheet yang berubah atau tidak terbaca sebagai "Pelaksana".
            const importantTokens = Array.from(userTokens).filter(t => t.length >= 5);
            return importantTokens.some(t => rawTextNorm.includes(t));
        }

        function toTitleCase(str) {
            return String(str || '').toLowerCase().replace(/(^|\s)\S/g, ch => ch.toUpperCase());
        }
        
        const getVal = (obj, possibleKeys) => {
            if (!obj) return null;
            const keys = Object.keys(obj);
            const normalizedPossible = possibleKeys.map(pk => normalize(pk));

            // 1) Cocok persis setelah normalisasi.
            let foundKey = keys.find(k => normalizedPossible.includes(normalize(k)));
            if(foundKey) return obj[foundKey];

            // 2) Cocok sebagian. Ini penting jika header Sheet berubah,
            // misalnya "Nama Pelaksana Kegiatan", "Nama Pegawai / Pelaksana", dll.
            foundKey = keys.find(k => {
                const nk = normalize(k);
                return normalizedPossible.some(pk => pk && (nk.includes(pk) || pk.includes(nk)));
            });
            return foundKey ? obj[foundKey] : null;
        };

        // --- ROLE / PEMBAGIAN PERAN ARIKA ---
        // Kolom yang bisa dipakai di Sheet Pegawai: Peran, Role, Hak Akses, Akses, atau Kewenangan.
        // Kolom opsional untuk membatasi cakupan verifikator: Cakupan Unit, Unit Binaan, atau Cakupan Fungsi.
        // Nilai Peran yang memberi akses panel terbatas: Ketua Tim, Verifikator, Atasan, Supervisor, Koordinator, PJ Fungsi.
        // Catatan: Rosana Anna Ashari dan Imam Taufik diisi sebagai Ketua Tim, bukan Verifikator.
        // Ketua Tim/Verifikator bekerja terbatas pada unit binaan masing-masing.
        const ARIKA_DEFAULT_VERIFIER_SCOPE = {
            rosana: {
                mode: 'include',
                labs: ['Staf Fungsi Pengujian Kimia Pangan', 'Staf Fungsi Pengujian Mikrobiologi'],
                label: 'Kimia Pangan & Mikrobiologi',
                note: 'Cakupan khusus Ketua Tim Rosana Anna Ashari, S. Farm., Apt.'
            },
            imam: {
                mode: 'exclude',
                excludeLabs: ['Staf Fungsi Pengujian Kimia Pangan', 'Staf Fungsi Pengujian Mikrobiologi'],
                label: 'Selain Kimia Pangan & Mikrobiologi',
                note: 'Cakupan khusus Ketua Tim Imam Taufik, S. Farm., Apt., M.Farm.'
            }
        };

        function getPegawaiRoleValue(profile) {
            if(!profile) return 'Pegawai';
            return (getVal(profile, ['peran', 'Peran', 'role', 'Role', 'hak akses', 'Hak Akses', 'akses', 'Akses', 'kewenangan', 'Kewenangan', 'jabatan tugas', 'Jabatan Tugas']) || profile.peran || profile.role || profile.akses || 'Pegawai').toString();
        }

        function getPegawaiScopeValue(profile) {
            if(!profile) return '';
            return (getVal(profile, ['cakupan unit', 'Cakupan Unit', 'unit binaan', 'Unit Binaan', 'cakupan fungsi', 'Cakupan Fungsi', 'fungsi binaan', 'Fungsi Binaan', 'scope', 'Scope']) || profile.cakupanUnit || profile.unitBinaan || profile.cakupanFungsi || '').toString().trim();
        }

        // v151: Sinkronisasi role efektif dari master Pegawai.
        // Saat ARIKA disematkan di Google Sites, session iframe bisa berbeda dari file HTML lokal.
        // Kadang profil session hanya berisi nama/NIP tanpa kolom Peran/Cakupan Unit. Fungsi ini mencari ulang
        // baris pegawai dari masterPegawai dan menggabungkan role/cakupan agar tab Ketua Tim/Verifikator tetap muncul.
        function arikaGetProfileNameValue(profile) {
            const p = profile || {};
            return (getVal(p, ['nama', 'Nama', 'name', 'Name', 'pelaksana', 'Pelaksana']) || p.nama || p.name || '').toString().trim();
        }

        function arikaFindMasterPegawaiRecord(profile) {
            const p = profile || window.currentUser || {};
            const nip = normalize(p.nip || p.NIP || getVal(p, ['nip', 'NIP']) || '');
            const nama = normalize(arikaGetProfileNameValue(p));
            if(!Array.isArray(window.masterPegawai) || !window.masterPegawai.length) return null;
            return window.masterPegawai.find(row => {
                const rowNip = normalize(row.nip || row.NIP || getVal(row, ['nip', 'NIP']) || '');
                const rowNama = normalize(arikaGetProfileNameValue(row));
                if(nip && rowNip && nip === rowNip) return true;
                if(nama && rowNama && nama === rowNama) return true;
                return false;
            }) || null;
        }

        function arikaGetEffectivePegawaiProfile(profile) {
            const base = profile || window.currentUser || {};
            const master = arikaFindMasterPegawaiRecord(base);
            if(!master) return base;
            // Master Pegawai menjadi sumber utama untuk Peran dan Cakupan Unit, tetapi data session lain tetap dipertahankan.
            return Object.assign({}, base, master, {
                peran: master.peran || master.Peran || base.peran || base.Peran || '',
                cakupanUnit: master.cakupanUnit || master['Cakupan Unit'] || base.cakupanUnit || base['Cakupan Unit'] || '',
                lab: master.lab || master['Fungsi Kerja'] || base.lab || base['Fungsi Kerja'] || ''
            });
        }

        function arikaRefreshCurrentUserRoleFromMaster() {
            try {
                if(!window.currentUser || window.isAdmin) return false;
                const merged = arikaGetEffectivePegawaiProfile(window.currentUser);
                const role = getPegawaiRoleValue(merged);
                const namedKetua = (typeof isNamedKetuaTim === 'function') && isNamedKetuaTim(merged);
                const reviewer = namedKetua || isReviewerRoleValue(role);
                if(reviewer) {
                    window.currentUser = Object.assign({}, window.currentUser, merged);
                    window.userRole = namedKetua ? 'Ketua Tim' : (role || 'Verifikator');
                    window.isReviewer = true;
                    try { persistSession && persistSession({ profile: window.currentUser, isAdmin: false, loginDate: getTodayKey(), lastView: 'beranda', __arikaSession: true }); } catch(e) {}
                    return true;
                }
            } catch(e) {}
            return false;
        }

        function normalizeRoleText(value) {
            return normalize(String(value || 'Pegawai'));
        }

        function isReviewerRoleValue(value) {
            const r = normalizeRoleText(value);
            return ['verifikator', 'ketuatim', 'atasan', 'supervisor', 'koordinator', 'pjfungsi', 'penanggungjawabfungsi', 'reviewer', 'adminterbatas'].some(key => r.includes(key));
        }

        function isKetuaTimRoleValue(value) {
            const r = normalizeRoleText(value);
            return r.includes('ketuatim') || r.includes('koordinator') || r.includes('pjfungsi') || r.includes('penanggungjawabfungsi');
        }

        function isNamedKetuaTim(profile) {
            const nameKey = normalize(getVerifierName(profile || window.currentUser || {}));
            return (nameKey.includes('rosana') && (nameKey.includes('ashari') || nameKey.includes('anna'))) ||
                   (nameKey.includes('imamtaufik') || (nameKey.includes('imam') && nameKey.includes('taufik')));
        }

        function getAccessPanelLabel(profile) {
            if(window.isAdmin) return 'Admin';
            const p = arikaGetEffectivePegawaiProfile(profile || window.currentUser || {});
            const role = getPegawaiRoleValue(p);
            if(isKetuaTimRoleValue(role) || isNamedKetuaTim(p)) return 'Ketua Tim';
            return isReviewerRoleValue(role) ? 'Verifikator' : 'Pegawai';
        }

        function splitScopeUnits(raw) {
            return String(raw || '')
                .replace(/\r/g, '\n')
                .split(/[;|\n]+/)
                .map(v => v.trim())
                .filter(Boolean);
        }

        function parseVerifierScopeFromSheet(raw) {
            const text = String(raw || '').trim();
            if(!text) return null;
            const lower = text.toLowerCase();
            const allKeys = ['semua', 'semua unit', 'semua fungsi', 'all'];
            if(allKeys.some(k => lower === k)) {
                return { mode: 'all', label: 'Semua Fungsi/Lab', source: 'sheet' };
            }
            if(lower.startsWith('selain:') || lower.startsWith('kecuali:') || lower.startsWith('exclude:')) {
                const clean = text.replace(/^(selain|kecuali|exclude)\s*:/i, '').trim();
                const excludeLabs = splitScopeUnits(clean);
                return {
                    mode: 'exclude',
                    excludeLabs,
                    label: excludeLabs.length ? `Selain ${excludeLabs.join(' & ')}` : 'Selain unit tertentu',
                    source: 'sheet'
                };
            }
            const labs = splitScopeUnits(text);
            return {
                mode: 'include',
                labs,
                label: labs.length > 1 ? labs.join(' & ') : (labs[0] || 'Unit Binaan'),
                source: 'sheet'
            };
        }

        function getVerifierName(profile) {
            const p = profile || window.currentUser || {};
            return (getVal(p, ['nama', 'Nama', 'name', 'Name', 'pelaksana', 'Pelaksana']) || p.nama || p.name || '').toString();
        }

        function getVerifierScopeConfig(profile) {
            if(window.isAdmin) return { mode: 'all', label: 'Semua Fungsi/Lab', source: 'admin' };
            const p = arikaGetEffectivePegawaiProfile(profile || window.currentUser || {});

            // 1) Utamakan konfigurasi dari Sheet Pegawai jika kolom Cakupan Unit/Unit Binaan diisi.
            const sheetScope = parseVerifierScopeFromSheet(getPegawaiScopeValue(p));
            if(sheetScope) return sheetScope;

            // 2) Aturan khusus sesuai permintaan user.
            const nameKey = normalize(getVerifierName(p));
            if(nameKey.includes('rosana') && (nameKey.includes('ashari') || nameKey.includes('anna'))) {
                return { ...ARIKA_DEFAULT_VERIFIER_SCOPE.rosana, source: 'default-name-rule' };
            }
            if(nameKey.includes('imamtaufik') || (nameKey.includes('imam') && nameKey.includes('taufik'))) {
                return { ...ARIKA_DEFAULT_VERIFIER_SCOPE.imam, source: 'default-name-rule' };
            }

            // 3) Fallback lama: Verifikator hanya melihat Fungsi Kerja miliknya sendiri.
            const lab = getVal(p, ['lab', 'fungsi', 'Fungsi Kerja', 'fungsi kerja', 'unit kerja', 'Unit Kerja']) || p.lab || '';
            return {
                mode: 'include',
                labs: lab ? [String(lab).trim()] : [],
                label: lab ? String(lab).trim() : 'Unit yang ditetapkan',
                source: 'fallback-profile-lab'
            };
        }

        function getCurrentRoleLabel() {
            if(window.isAdmin) return 'Admin Utama';
            return getAccessPanelLabel(window.currentUser || { peran: window.userRole || 'Pegawai' });
        }

        function canAccessAdminPanel() {
            if(window.isAdmin) return true;
            if(arikaRefreshCurrentUserRoleFromMaster()) return true;
            const effective = arikaGetEffectivePegawaiProfile(window.currentUser || {});
            return !!window.isReviewer || isReviewerRoleValue(window.userRole) || isReviewerRoleValue(getPegawaiRoleValue(effective)) || isNamedKetuaTim(effective);
        }

        function canReviewJurnal() {
            return canAccessAdminPanel();
        }

        function canManageInfoBoards() {
            // Papan Pengumuman dan Agenda boleh dikelola Admin Utama, Ketua Tim, atau Verifikator.
            return !!window.isAdmin || canAccessAdminPanel();
        }

        function isVerifierScopedMode() {
            return !window.isAdmin && canAccessAdminPanel();
        }

        function getVerifierUnitLabel() {
            return getVerifierScopeConfig(window.currentUser).label || 'Unit yang ditetapkan';
        }

        function getRowLabValue(row) {
            return getVal(row || {}, ['lab', 'Lab', 'laboratorium', 'fungsi', 'Fungsi Kerja', 'fungsi kerja', 'unit kerja', 'Unit Kerja']) || row?.lab || row?.fungsi || '';
        }

        function labAllowedByVerifierScope(rowLab, config) {
            const scope = config || getVerifierScopeConfig(window.currentUser);
            if(!scope || scope.mode === 'all') return true;
            if(scope.mode === 'exclude') {
                const excluded = Array.isArray(scope.excludeLabs) ? scope.excludeLabs : [];
                return !excluded.some(lab => labMatches(rowLab, lab));
            }
            const labs = Array.isArray(scope.labs) ? scope.labs : [];
            if(!labs.length) return false;
            return labs.some(lab => labMatches(rowLab, lab));
        }

        function rowMatchesVerifierUnit(row) {
            if(!isVerifierScopedMode()) return true;
            return labAllowedByVerifierScope(getRowLabValue(row), getVerifierScopeConfig(window.currentUser));
        }

        function getRoleScopedJurnalRows(sourceRows) {
            const rows = Array.isArray(sourceRows) ? sourceRows : (window.arikaData || []);
            return isVerifierScopedMode() ? rows.filter(rowMatchesVerifierUnit) : rows;
        }

        function getRoleScopedPegawaiRows(sourceRows) {
            const rows = Array.isArray(sourceRows) ? sourceRows : (window.masterPegawai || []);
            return isVerifierScopedMode() ? rows.filter(rowMatchesVerifierUnit) : rows;
        }

        function optionIsAllUnit(opt) {
            const val = String(opt?.value || opt?.textContent || '').trim();
            return !val || val === 'Semua' || canonicalLabKey(val) === 'semua' || normalize(val).includes('semua');
        }

        function restrictSelectOptionsToVerifierScope(select, config) {
            if(!select || !isVerifierScopedMode()) return;
            const scope = config || getVerifierScopeConfig(window.currentUser);
            const options = Array.from(select.options || []);

            options.forEach(opt => {
                if(optionIsAllUnit(opt)) {
                    opt.value = 'Semua';
                    opt.textContent = 'Semua Unit Binaan';
                    return;
                }
                const allowed = labAllowedByVerifierScope(opt.value || opt.textContent, scope);
                if(!allowed) opt.remove();
            });

            const hasAll = Array.from(select.options || []).some(optionIsAllUnit);
            if(!hasAll) select.insertAdjacentHTML('afterbegin', '<option value="Semua">Semua Unit Binaan</option>');
            if(!Array.from(select.options || []).some(opt => opt.value === select.value)) select.value = 'Semua';
        }

        function lockSelectToVerifierUnit(selectId) {
            const select = document.getElementById(selectId);
            if(!select || !isVerifierScopedMode()) return;
            const scope = getVerifierScopeConfig(window.currentUser);

            // Jika cakupan hanya satu unit, kunci filter pada unit tersebut.
            if(scope.mode === 'include' && Array.isArray(scope.labs) && scope.labs.length === 1) {
                const myLab = scope.labs[0];
                const exists = Array.from(select.options || []).some(opt => opt.value === myLab || labMatches(opt.value, myLab));
                if(!exists) select.innerHTML = `<option value="${escapeHTML(myLab)}">${escapeHTML(myLab)}</option>` + select.innerHTML;
                select.value = Array.from(select.options || []).find(opt => opt.value === myLab || labMatches(opt.value, myLab))?.value || myLab;
                select.disabled = true;
                select.title = 'Ketua Tim/Verifikator hanya melihat data pada Fungsi Kerja/unit binaannya.';
                return;
            }

            // Jika cakupan lebih dari satu unit atau berupa pengecualian, biarkan filter bisa dipakai,
            // tetapi opsi yang di luar cakupan disembunyikan.
            restrictSelectOptionsToVerifierScope(select, scope);
            select.disabled = false;
            select.title = `Cakupan ${getAccessPanelLabel(window.currentUser)}: ${getVerifierUnitLabel()}`;
        }

        function getAllowedAdminTabsByRole() {
            if(window.isAdmin) return ['pegawai', 'analitik', 'lembur', 'survei', 'rekap', 'pengumuman', 'agenda'];
            if(canAccessAdminPanel()) return ['analitik', 'lembur', 'rekap', 'pengumuman', 'agenda'];
            return [];
        }

        function isJurnalFollowedUp(row) {
            const status = normalize(row?.statusTindakLanjutPegawai || getVal(row || {}, ['Status Tindak Lanjut Pegawai', 'status tindak lanjut pegawai']) || '');
            const tanggal = row?.tanggalTindakLanjut || getVal(row || {}, ['Tanggal Tindak Lanjut', 'tanggal tindak lanjut']);
            return !!tanggal || status.includes('sudah') || status.includes('selesai') || status.includes('ditindaklanjuti');
        }

        function renderRoleWorkspaceOverview() {
            const box = document.getElementById('role-workspace-overview');
            const shell = document.getElementById('view-admin');
            if(!box || !shell) return;

            const isRoleMode = !window.isAdmin && canAccessAdminPanel();
            shell.classList.toggle('role-mode', isRoleMode);
            box.classList.toggle('hidden', !isRoleMode);
            if(!isRoleMode) return;

            const accessLabel = getAccessPanelLabel(window.currentUser);
            const unitLabel = getVerifierUnitLabel() || 'Unit yang ditetapkan';
            const rows = getRoleScopedJurnalRows(window.arikaData || []);
            const pegawaiRows = getRoleScopedPegawaiRows(window.masterPegawai || []);
            const lemburRows = rows.filter(d => d.isLembur || hasExplicitLemburMarker(d));
            const pendingCatatanRows = rows.filter(d => String(d.catatanAtasan || '').trim() && !isJurnalFollowedUp(d));

            const uniqPegawai = new Set();
            rows.forEach(d => {
                const key = normalize(d.nip || d.name || '');
                if(key) uniqPegawai.add(key);
            });
            pegawaiRows.forEach(p => {
                const key = normalize(p.nip || p.nama || '');
                if(key) uniqPegawai.add(key);
            });

            const setText = (id, value) => {
                const el = document.getElementById(id);
                if(el) el.textContent = value;
            };

            setText('role-workspace-kicker', accessLabel === 'Ketua Tim' ? '🛡️ Ketua Tim Aktif' : '🛡️ Verifikator Aktif');
            setText('role-workspace-title', accessLabel === 'Ketua Tim' ? 'Ruang Kerja Ketua Tim' : 'Ruang Kerja Verifikator');
            setText('role-workspace-desc', accessLabel === 'Ketua Tim'
                ? 'Pantau jurnal unit binaan, beri catatan, verifikasi lembur, serta kelola pengumuman dan agenda kegiatan dengan akses terbatas.'
                : 'Pantau dan tinjau jurnal sesuai cakupan tugas tanpa membuka fitur Admin Utama.');
            setText('role-workspace-unit', unitLabel);
            setText('role-stat-jurnal', rows.length);
            setText('role-stat-lembur', lemburRows.length);
            setText('role-stat-catatan', pendingCatatanRows.length);
            setText('role-stat-pegawai', uniqPegawai.size || pegawaiRows.length || '-');

            const activeTabText = document.querySelector('#view-admin .admin-tab.is-active span:last-child')?.textContent || 'dashboard';
            setText('role-workspace-guidance', `Anda sedang berada pada ${activeTabText}. Data yang tampil mengikuti cakupan ${accessLabel}: ${unitLabel}.`);
        }

        function applyAdminRoleAccess() {
            const allowed = getAllowedAdminTabsByRole();
            const tabIds = ['pegawai', 'analitik', 'lembur', 'survei', 'rekap', 'pengumuman', 'agenda'];
            tabIds.forEach(id => {
                const tab = document.getElementById('admin-tab-' + id);
                const content = document.getElementById('admin-content-' + id);
                const isAllowed = allowed.includes(id);
                if(tab) {
                    tab.classList.toggle('hidden', !isAllowed);
                    tab.disabled = !isAllowed;
                    tab.setAttribute('aria-hidden', isAllowed ? 'false' : 'true');
                }
                if(content && !isAllowed) content.classList.add('hidden');
            });

            const spkCard = document.getElementById('admin-overtime-spk-card');
            if(spkCard) spkCard.classList.toggle('hidden', !window.isAdmin);

            const rekapDownloadBtn = document.getElementById('admin-rekap-download-all-btn');
            if(rekapDownloadBtn) rekapDownloadBtn.classList.toggle('hidden', !window.isAdmin);

            const heroTitle = document.querySelector('#view-admin .admin-hero-title');
            const heroKicker = document.querySelector('#view-admin .admin-hero-kicker');
            const statusPill = document.querySelector('#view-admin .admin-status-pill');
            const heroSub = document.querySelector('#view-admin .admin-hero-subtitle');
            if(!window.isAdmin && canAccessAdminPanel()) {
                const accessLabel = getAccessPanelLabel(window.currentUser);
                if(heroKicker) heroKicker.textContent = `🛡️ Panel ${accessLabel}`;
                if(heroTitle) heroTitle.textContent = accessLabel === 'Ketua Tim' ? 'Ruang Kerja Ketua Tim' : 'Ruang Kerja Verifikator';
                if(statusPill) statusPill.textContent = `● ${accessLabel} Aktif`;
                if(heroSub) heroSub.textContent = `Akses terbatas untuk memantau jurnal pegawai pada unit binaan ${getVerifierUnitLabel() || 'yang ditetapkan'}, memverifikasi lembur, memberi catatan jurnal, serta membuat papan pengumuman dan agenda kegiatan.`;
            } else {
                if(heroKicker) heroKicker.textContent = '⚙️ Panel Administrator';
                if(heroTitle) heroTitle.textContent = 'Pengelolaan & Monitoring ARIKA';
                if(statusPill) statusPill.textContent = '● Admin Aktif';
                if(heroSub) heroSub.textContent = 'Kelola pegawai, pantau jurnal harian, evaluasi lembur, survei, pengumuman, dan agenda dalam satu dashboard yang ringkas dan siap digunakan untuk monev internal.';
            }

            renderRoleWorkspaceOverview && renderRoleWorkspaceOverview();
        }

        const extractTime = (timeVal) => {
            if (timeVal === null || timeVal === undefined || timeVal === "") return "";

            // Google Sheets sering mengirim sel bertipe TIME sebagai Date 1899-12-30.
            // Yang dibutuhkan aplikasi hanya HH:mm.
            if (timeVal instanceof Date && !Number.isNaN(timeVal.getTime())) {
                const hh = String(timeVal.getHours()).padStart(2, '0');
                const mm = String(timeVal.getMinutes()).padStart(2, '0');
                return `${hh}:${mm}`;
            }

            // Jika Apps Script mengirim angka serial/fraction dari Sheets.
            // Contoh: 0.708333 = 17:00, atau 45291.708333 = tanggal + jam.
            if (typeof timeVal === 'number') {
                const fraction = timeVal >= 1 ? timeVal - Math.floor(timeVal) : timeVal;
                if (fraction > 0 && fraction < 1) {
                    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
                    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
                    const mm = String(totalMinutes % 60).padStart(2, '0');
                    return `${hh}:${mm}`;
                }
                // Jika angka utuh kecil, kemungkinan durasi/jam, bukan jam mulai.
                return "";
            }

            let str = String(timeVal).trim();
            if (!str) return "";

            // Bersihkan beberapa karakter pemisah umum dari hasil export Sheet.
            str = str.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');

            // Format yang didukung:
            // 08:30, 08.30, 08:30:00
            // 1899-12-30T08:30:00.000Z, 1899-12-30 08:30:00
            // Sat Dec 30 1899 08:30:00 GMT+...
            const timeMatch = str.match(/(?:^|[T\s])([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?/);
            if (timeMatch) {
                return `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}`;
            }

            // Format 0830 atau 1730.
            const compactMatch = str.match(/^([01]\d|2[0-3])([0-5]\d)$/);
            if (compactMatch) {
                return `${compactMatch[1]}:${compactMatch[2]}`;
            }

            // Jika hanya tanggal 1899-12-30 tanpa jam, jam memang tidak ikut terkirim dari backend.
            if (/^1899[-\/]12[-\/]30/.test(str)) return "";

            return "";
        };

        const parseTimeRange = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return { start: '', end: '', duration: '' };

            const normalized = raw
                .replace(/\u00a0/g, ' ')
                .replace(/s\.d\.?|sd|sampai|hingga|to/gi, '-')
                .replace(/[–—]/g, '-')
                .replace(/\s+/g, ' ');

            const matches = [...normalized.matchAll(/([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?/g)];
            if (matches.length >= 2) {
                const start = `${String(Number(matches[0][1])).padStart(2, '0')}:${matches[0][2]}`;
                const end = `${String(Number(matches[1][1])).padStart(2, '0')}:${matches[1][2]}`;
                return { start, end, duration: '' };
            }

            // Format seperti "2", "2 jam", "2,5 jam", atau "120 menit" disimpan sebagai fallback durasi.
            const durMatch = normalized.match(/^(\d+(?:[,.]\d+)?)\s*(jam|j|hour|hours)?$/i)
                || normalized.match(/(\d+(?:[,.]\d+)?)\s*(jam|j|hour|hours)/i)
                || normalized.match(/(\d+)\s*(menit|mnt|minute|minutes)/i);
            if (durMatch) return { start: '', end: '', duration: durMatch[0] };

            return { start: '', end: '', duration: '' };
        };

        function normalizeDateKeyFromSheet(value) {
            if(!value) return '';
            if(value instanceof Date && !Number.isNaN(value.getTime())) {
                return value.toLocaleDateString('en-CA');
            }
            const raw = String(value || '').trim();
            if(!raw) return '';
            const iso = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
            if(iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`;
            const local = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
            if(local) return `${local[3]}-${String(Number(local[2])).padStart(2, '0')}-${String(Number(local[1])).padStart(2, '0')}`;
            const parsed = new Date(raw);
            if(!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString('en-CA');
            return raw.split('T')[0];
        }

        function getJurnalSortTime(row) {
            const input = row?.inputAt ? new Date(row.inputAt).getTime() : NaN;
            if(Number.isFinite(input)) return input;
            const dateVal = row?.date ? new Date(row.date + 'T00:00:00').getTime() : NaN;
            return Number.isFinite(dateVal) ? dateVal : 0;
        }

        function dedupeJurnalData(rows) {
            const map = new Map();
            (rows || []).forEach((row, idx) => {
                if(!row || !row.date) return;
                const idKey = String(row.id || '').trim();
                const semanticKey = `${row.date}|${normalize(row.name)}|${normalize(row.desc)}|${normalize(row.cat)}`;
                const key = idKey || semanticKey || `row-${idx}`;
                const current = map.get(key);
                if(!current || getJurnalSortTime(row) >= getJurnalSortTime(current)) {
                    map.set(key, row);
                }
            });
            return Array.from(map.values()).sort((a, b) => {
                const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
                if(dateCompare !== 0) return dateCompare;
                return getJurnalSortTime(b) - getJurnalSortTime(a);
            });
        }

        function getExplicitLemburFlagFromRow(row) {
            if(!row) return { found: false, key: '', value: undefined };
            const keys = Object.keys(row || {});
            const exactNames = new Set([
                'islembur', 'islemburpegawai', 'lembur', 'kegiatanlembur',
                'tandalembur', 'statuslembur', 'checkboxlembur', 'pilihanlembur'
            ]);

            // 1) Prioritas: nama kolom yang memang menjadi penanda lembur.
            for(const key of keys) {
                const nk = normalize(key);
                if(exactNames.has(nk)) return { found: true, key, value: row[key] };
            }

            // 2) Kompatibilitas header variasi, tetap hanya header yang berarti penanda.
            // Hindari salah ambil dari kolom Lama Lembur, Jam Lembur, Surat Tugas, Link Data Dukung, dll.
            const forbidden = ['lama', 'durasi', 'jam', 'waktu', 'mulai', 'selesai', 'akhir', 'awal', 'surat', 'tugas', 'nomor', 'no', 'link', 'data', 'dukung', 'bukti', 'uraian', 'deskripsi', 'catatan'];
            for(const key of keys) {
                const nk = normalize(key);
                if(!nk.includes('lembur')) continue;
                if(forbidden.some(word => nk.includes(word))) continue;
                return { found: true, key, value: row[key] };
            }

            // 3) Data lokal ARIKA yang dibuat sebelum dikirim ke Google Sheet biasanya memakai isLembur.
            if(Object.prototype.hasOwnProperty.call(row, 'isLembur')) {
                return { found: true, key: 'isLembur', value: row.isLembur };
            }
            if(Object.prototype.hasOwnProperty.call(row, 'is_lembur')) {
                return { found: true, key: 'is_lembur', value: row.is_lembur };
            }

            return { found: false, key: '', value: undefined };
        }

        function mapJurnalRowsFromSheet(rawRows) {
            return dedupeJurnalData((rawRows || []).map((d, idx) => {
                const rawName = (getVal(d, [
                    'name', 'nama', 'pelaksana', 'nama pegawai', 'nama_pegawai',
                    'nama pelaksana', 'pelaksana kegiatan', 'nama pelaksana kegiatan',
                    'pegawai', 'personil', 'nama lengkap', 'nama petugas', 'petugas',
                    'pengisi', 'dibuat oleh', 'created by'
                ]) || '').toString();
                const pegawaiRef = window.masterPegawai.find(p => normalize(p.nama) === normalize(rawName)) || {};
                const dateVal = normalizeDateKeyFromSheet(getVal(d, ['date', 'tanggal', 'tgl']));
                const descVal = (getVal(d, ['desc', 'deskripsi', 'uraian', 'pekerjaan', 'uraian pekerjaan']) || '').toString();
                const rawStartVal = getVal(d, ['start', 'mulai', 'jam_mulai', 'jam mulai', 'jam mulai lembur', 'jammulailembur', 'jam_mulai_lembur', 'jam lembur mulai', 'jam awal', 'jam awal lembur', 'waktu mulai', 'waktu mulai lembur']);
                const rawEndVal = getVal(d, ['end', 'selesai', 'jam_selesai', 'jam selesai', 'jam akhir lembur', 'jamakhirlembur', 'jam_akhir_lembur', 'jam lembur akhir', 'jam akhir', 'jam selesai lembur', 'waktu selesai', 'waktu akhir', 'waktu akhir lembur']);
                const rawWaktuVal = getVal(d, ['waktu', 'waktu jam', 'waktu (jam)', 'jam', 'jam lembur', 'waktu lembur', 'rentang waktu', 'rentang jam', 'pukul', 'pukul lembur']);
                const parsedWaktu = parseTimeRange(rawWaktuVal);
                const startVal = extractTime(rawStartVal) || parsedWaktu.start;
                const endVal = extractTime(rawEndVal) || parsedWaktu.end;
                const lamaVal = (getVal(d, ['lamaLembur', 'lama lembur', 'lama_lembur', 'lama lembur jam', 'lama lembur (jam)', 'lama lembur (Jam)', 'durasi', 'durasi lembur', 'jumlah jam', 'jumlah jam lembur', 'total jam', 'total jam lembur']) || parsedWaktu.duration || '').toString();
                const lemburFlagInfo = getExplicitLemburFlagFromRow(d);
                const lemburFlagVal = lemburFlagInfo.value;
                const hasExplicitLemburMark = isTruthyLemburValue(lemburFlagVal);
                const inputAtVal = (getVal(d, ['Timestamp', 'timestamp', 'waktu input', 'createdAt', 'created_at', 'tanggal input']) || '').toString();
                return {
                    id: (getVal(d, ['ID Jurnal', 'id', 'id_jurnal', 'id jurnal', 'idjurnal']) || `${dateVal}-${normalize(rawName || getRowSearchText(d))}-${idx}`).toString(),
                    date: dateVal,
                    name: rawName,
                    _rawText: getRowSearchText(d),
                    nip: (getVal(d, ['nip', 'nip_pegawai', 'nip pegawai', 'nomor nip', 'nip pelaksana', 'nip petugas']) || pegawaiRef.nip || '').toString(),
                    cat: (getVal(d, ['cat', 'kategori', 'category']) || 'Lainnya').toString(),
                    desc: descVal,
                    status: (getVal(d, ['status', 'status_pekerjaan', 'status_akhir']) || 'Selesai').toString(),
                    statusPegawai: (getVal(d, ['statusPegawai', 'status_pegawai', 'status pegawai', 'kepegawaian']) || pegawaiRef.status || '').toString(),
                    lab: (getVal(d, ['lab', 'laboratorium', 'fungsi', 'fungsi_kerja', 'fungsi kerja']) || pegawaiRef.lab || '').toString(),
                    pangkat: (getVal(d, ['pangkat', 'golongan', 'pangkat/gol', 'pangkat gol', 'pangkat_golongan']) || pegawaiRef.pangkat || '').toString(),
                    suratTugas: (getVal(d, ['suratTugas', 'surat_tugas', 'surat tugas', 'nomor surat tugas', 'nomor/tanggal surat tugas', 'nomor tanggal surat tugas']) || '').toString(),
                    linkDataDukung: (getVal(d, ['linkDataDukung', 'link_data_dukung', 'link data dukung', 'Link Data Dukung', 'data dukung', 'link bukti', 'bukti dukung', 'link dokumen']) || '').toString(),
                    catatanAtasan: (getVal(d, ['Catatan Atasan', 'catatanAtasan', 'catatan_atasan', 'catatan atasan', 'review atasan', 'komentar atasan']) || '').toString(),
                    statusEvaluasiAtasan: (getVal(d, ['Status Evaluasi Atasan', 'statusEvaluasiAtasan', 'status evaluasi atasan', 'status review', 'evaluasi atasan']) || '').toString(),
                    namaPemberiCatatan: (getVal(d, ['Nama Pemberi Catatan', 'namaPemberiCatatan', 'pemberi catatan', 'reviewer']) || '').toString(),
                    tanggalCatatanAtasan: normalizeDateKeyFromSheet(getVal(d, ['Tanggal Catatan Atasan', 'tanggalCatatanAtasan', 'tanggal catatan atasan', 'tanggal review'])),
                    statusTindakLanjutPegawai: (getVal(d, ['Status Tindak Lanjut Pegawai', 'statusTindakLanjutPegawai', 'status tindak lanjut pegawai', 'tindak lanjut pegawai']) || '').toString(),
                    tanggalTindakLanjut: normalizeDateKeyFromSheet(getVal(d, ['Tanggal Tindak Lanjut', 'tanggalTindakLanjut', 'tanggal tindak lanjut'])),
                    inputAt: inputAtVal,
                    _rawRow: d,
                    lemburFlagRaw: lemburFlagVal,
                    lemburFlagKey: lemburFlagInfo.key || '',
                    hasExplicitLemburMark: hasExplicitLemburMark,
                    isLembur: hasExplicitLemburMark,
                    start: startVal,
                    end: endVal,
                    waktuText: (rawWaktuVal || '').toString(),
                    lamaLembur: lamaVal
                };
            }).filter(d => d.date !== ''));
        }

        // --- CUSTOM ALERTS & CONFIRM OVERLAYS (No window.alert/confirm allowed) ---
        let confirmCallback = null;
        
        window.showCustomAlert = (msg) => {
            const modal = document.getElementById('custom-alert-modal');
            const text = document.getElementById('custom-alert-text');
            if (modal && text) {
                text.innerText = msg;
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        };

        window.closeCustomAlert = () => {
            const modal = document.getElementById('custom-alert-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        };

        window.showCustomConfirm = (msg, onConfirm) => {
            const modal = document.getElementById('custom-confirm-modal');
            const text = document.getElementById('custom-confirm-text');
            if (modal && text) {
                text.innerText = msg;
                confirmCallback = onConfirm;
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        };

        window.closeCustomConfirm = () => {
            const modal = document.getElementById('custom-confirm-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
            confirmCallback = null;
        };

        const handleCustomConfirmYes = () => {
            if (confirmCallback) {
                confirmCallback();
            }
            window.closeCustomConfirm();
        };

        const yesBtn = document.getElementById('custom-confirm-yes');
        if (yesBtn) {
            yesBtn.addEventListener('click', handleCustomConfirmYes);
        }

        // --- ATTACH LOGIC TO WINDOW ---
        window.showLoader = (show, text = "Memproses...") => {
            const loader = document.getElementById('global-loader');
            const loaderText = document.getElementById('loader-text');
            if (loaderText && text) loaderText.innerText = text;
            if (!loader) return;

            if (show) {
                loader.style.display = 'flex';
                loader.style.opacity = '1';
                loader.style.pointerEvents = 'auto';
            } else {
                loader.style.opacity = '0';
                loader.style.pointerEvents = 'none';
                setTimeout(() => {
                    if (loader.style.opacity === '0') loader.style.display = 'none';
                }, 220);
            }
        };

        window.addEventListener('unhandledrejection', (event) => {
            console.warn('ARIKA unhandled rejection:', event.reason);
            const loader = document.getElementById('global-loader');
            if(loader && loader.style.display !== 'none') {
                try { window.showLoader(false); } catch(e) {}
            }
        });

        window.addEventListener('error', (event) => {
            console.warn('ARIKA runtime error:', event.message);
            const loader = document.getElementById('global-loader');
            if(loader && loader.style.display !== 'none' && !window.currentUser) {
                try { window.showLoader(false); } catch(e) {}
            }
        });

        window.togglePasswordVisibility = (inputId, iconId) => {
            const input = document.getElementById(inputId);
            const icon = document.getElementById(iconId);
            if (!input || !icon) return;
            if (input.type === "password") {
                input.type = "text";
                icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />`;
            } else {
                input.type = "password";
                icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
            }
        };

        window.nav = (id) => {
            if (id === 'login-user' || id === 'login-admin') {
                document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                const view = document.getElementById('view-' + id);
                if(view) view.classList.remove('hidden');
                return;
            }
            if (!window.currentUser && id !== 'login-admin') {
                window.nav('login-user');
                return;
            }

            // --- PROTEKSI NAVIGASI ADMIN ---
            if (id === 'admin' && !canAccessAdminPanel()) {
                window.showCustomAlert("Akses Ditolak: Halaman ini hanya diperuntukkan bagi Admin Utama, Ketua Tim, atau Verifikator.");
                window.nav('beranda');
                return;
            }

            // Admin hanya memerlukan Beranda dan Panel Admin.
            // Tab Isi Jurnal, Riwayat Jurnal, Laporan Lembur, dan Dashboard Saya diblokir untuk akun admin.
            if (window.isAdmin && !['beranda', 'panduan', 'admin'].includes(id)) {
                window.showCustomAlert("Akun administrator hanya dapat mengakses Beranda, Panduan, dan Panel Admin.");
                window.nav('beranda');
                return;
            }

            document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
            const target = document.getElementById('view-' + id);
            if (target) target.classList.remove('hidden');

            // Simpan halaman terakhir agar setelah reload tidak selalu kembali ke login/halaman awal.
            try {
                if (window.currentUser && !String(id || '').startsWith('login')) {
                    const session = readLocalSession();
                    if(session) {
                        session.lastView = id;
                        persistSession(session);
                    }
                }
            } catch(e) {}

            document.querySelectorAll('#nav-menu button').forEach(b => b.classList.remove('nav-active'));
            const btn = document.getElementById('btn-' + id);
            if (btn) btn.classList.add('nav-active');
            const mobileSelect = document.getElementById('mobile-nav-select');
            if (mobileSelect && mobileSelect.value !== id) mobileSelect.value = id;
            if (id === 'beranda') { window.renderPengumumanBoard(); window.renderAgendaSaya && window.renderAgendaSaya(); window.renderRencanaPribadi(); triggerDailyReminder(); window.renderJurnalReviewAlert && window.renderJurnalReviewAlert(); updateArikaReminderSoundPanel && updateArikaReminderSoundPanel(); window.updateHomeModernStats && window.updateHomeModernStats(); window.startArikaReminderCenter && window.startArikaReminderCenter(); setTimeout(() => window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'nav-beranda' }), 800); }
            if (id === 'jurnal' && !window.editingJurnalId) setJurnalEditMode(false);
            if (id === 'lembur') window.renderLemburTable();
            if (id === 'dashboard-pegawai') {
                const monthEl = document.getElementById('pegawai-dashboard-month');
                if(monthEl && !monthEl.value && !monthEl.dataset.touched) monthEl.value = getCurrentMonth();
                window.renderDashboardPegawai && window.renderDashboardPegawai();
            }
            if (id === 'rekap') {
                window.runFilter();
                window.renderVisualCalendar();
            }
            if (id === 'admin') {
                try {
                    applyAdminRoleAccess && applyAdminRoleAccess();
                    window.renderAdminDashboard();
                    setTimeout(() => window.fetchLiveJurnalFromSheet && window.fetchLiveJurnalFromSheet({ silent: true, timeoutMs: 12000 }), 500);
                } catch(err) {
                    console.error('Panel admin gagal render:', err);
                    const adminBody = document.getElementById('admin-pegawai-body');
                    if(adminBody) adminBody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-rose-400 italic text-[9px] uppercase font-black">Panel admin berhasil dibuka, tetapi sebagian data belum dapat dirender. Klik Muat Ulang Data.</td></tr>';
                }
            }
            if (window.arikaSafeTopAfterNav) window.arikaSafeTopAfterNav(); else window.scrollTo({ top: 0, behavior: 'auto' });
        };

        window.logout = async function() {
            window.showLoader(true, "Keluar...");
            clearSessionStorageAll();
            window.currentUser = null;
            window.isAdmin = false;
            window.userRole = 'Pegawai';
            window.isReviewer = false;
        window.userRole = 'Pegawai';
        window.isReviewer = false;
            try { if(arikaReminderWatcherTimer) clearInterval(arikaReminderWatcherTimer); updateArikaReminderSoundPanel && updateArikaReminderSoundPanel(); } catch(e) {}
            const nav = document.getElementById('main-nav');
            if(nav) nav.classList.add('hidden');
            document.querySelectorAll('input[type="password"]').forEach(i => i.value = '');
            window.nav('login-user');
            window.showLoader(false);
        };

        // --- SESSION LOGIC ---
        // Google Sites menampilkan HTML Embed di dalam iframe. Pada beberapa browser,
        // localStorage bisa tidak konsisten setelah refresh. Karena itu session disimpan
        // ke 3 tempat: localStorage, sessionStorage, dan window.name sebagai fallback.
        const ARIKA_SESSION_KEY = 'arika_session_v53_cloud_cache_persist';
        const ARIKA_OLD_SESSION_KEYS = ['arika_session_v52_cloud_persist', 'arika_session_v51_persist', 'arika_session_v49_persist', 'arika_session_v43', 'arika_session_v12'];

        const getTodayKey = () => {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        function normalizeSessionObject(session) {
            if (!session || !session.profile) return null;
            const created = session.createdAt ? new Date(session.createdAt).getTime() : Date.now();
            const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // aktif 7 hari dalam perangkat yang sama
            const stillFresh = Number.isFinite(created) ? (Date.now() - created <= maxAgeMs) : true;
            if (!stillFresh) return null;
            return {
                profile: session.profile,
                isAdmin: !!session.isAdmin,
                loginDate: session.loginDate || getTodayKey(),
                createdAt: session.createdAt || new Date().toISOString(),
                lastView: session.lastView || '',
                __arikaSession: true
            };
        }

        function readSessionFromStorage(storage, key) {
            try { return normalizeSessionObject(JSON.parse(storage.getItem(key) || 'null')); }
            catch(e) { return null; }
        }

        function hashArikaString(str) {
            let hash = 2166136261;
            for (let i = 0; i < str.length; i++) {
                hash ^= str.charCodeAt(i);
                hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
            }
            return (hash >>> 0).toString(36);
        }

        function getArikaDeviceFingerprint() {
            const tz = (() => {
                try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e) { return ''; }
            })();

            const screenInfo = (() => {
                try { return `${screen.width}x${screen.height}x${screen.colorDepth}`; } catch(e) { return ''; }
            })();

            const parts = [
                navigator.userAgent || '',
                navigator.language || '',
                navigator.platform || '',
                screenInfo,
                tz,
                String(navigator.hardwareConcurrency || ''),
                String(navigator.deviceMemory || ''),
                'ARIKA-BPOM-AMBON'
            ];

            return 'arika-' + hashArikaString(parts.join('|'));
        }

        async function fetchJsonSessionWithTimeout(url, timeoutMs = 5500) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
                if(!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } finally {
                clearTimeout(timer);
            }
        }

        async function restoreSessionFromCloud() {
            if(!SCRIPT_URL) return null;
            try {
                const fingerprint = getArikaDeviceFingerprint();
                const url = SCRIPT_URL + (SCRIPT_URL.includes('?') ? '&' : '?') +
                    'mode=session&fingerprint=' + encodeURIComponent(fingerprint) +
                    '&cb=' + Date.now();
                const data = await fetchJsonSessionWithTimeout(url, 6500);
                if(data && data.dataCache && hasUsableCachePayload(data.dataCache)) {
                    window.__ARIKA_CLOUD_DATA_CACHE__ = data.dataCache;
                }
                if(data && data.session) {
                    return normalizeSessionObject(data.session);
                }
            } catch(e) {
                console.warn('Restore session cloud gagal:', e);
            }
            return null;
        }

        let cloudSessionSaveTimer = null;
        function scheduleSaveSessionToCloud(session) {
            if(!session || !session.profile || !SCRIPT_URL) return;
            clearTimeout(cloudSessionSaveTimer);
            cloudSessionSaveTimer = setTimeout(() => {
                try {
                    const payload = {
                        fingerprint: getArikaDeviceFingerprint(),
                        session: {
                            profile: session.profile,
                            isAdmin: !!session.isAdmin,
                            loginDate: session.loginDate || getTodayKey(),
                            createdAt: session.createdAt || new Date().toISOString(),
                            lastView: session.lastView || '',
                            __arikaSession: true
                        },
                        userAgent: navigator.userAgent || '',
                        updatedAt: new Date().toISOString()
                    };
                    postToScript('save_session', payload).catch(err => console.warn('Save session cloud gagal:', err));
                } catch(e) {}
            }, 250);
        }

        function deleteSessionFromCloud() {
            if(!SCRIPT_URL) return;
            try {
                postToScript('delete_session', { fingerprint: getArikaDeviceFingerprint() }).catch(() => null);
            } catch(e) {}
        }

        async function restoreDataCacheFromCloud() {
            if(!SCRIPT_URL) return null;
            try {
                const url = SCRIPT_URL + (SCRIPT_URL.includes('?') ? '&' : '?') +
                    'mode=data_cache&fingerprint=' + encodeURIComponent(getArikaDeviceFingerprint()) +
                    '&cb=' + Date.now();
                const data = await fetchJsonSessionWithTimeout(url, 5500);
                if(data && data.dataCache && hasUsableCachePayload(data.dataCache)) {
                    window.__ARIKA_CLOUD_DATA_CACHE__ = data.dataCache;
                    return data.dataCache;
                }
            } catch(e) {
                console.warn('Restore cache cloud gagal:', e);
            }
            return null;
        }

        function compactForCloudCache(cache) {
            const base = {
                version: 'v53-cloud',
                ts: cache.ts || Date.now(),
                pegawai: cache.pegawai || [],
                jurnal: cache.jurnal || [],
                pengumuman: cache.pengumuman || [],
                rencana: cache.rencana || [],
                survei: cache.survei || [],
                agenda: cache.agenda || []
            };

            const limits = [
                { jurnal: 250, rencana: 160, survei: 120, agenda: 160, pengumuman: 120, pegawai: 220 },
                { jurnal: 150, rencana: 100, survei: 80, agenda: 100, pengumuman: 80, pegawai: 200 },
                { jurnal: 80, rencana: 60, survei: 50, agenda: 60, pengumuman: 50, pegawai: 160 },
                { jurnal: 35, rencana: 30, survei: 25, agenda: 30, pengumuman: 25, pegawai: 120 }
            ];

            for (const lim of limits) {
                const candidate = { ...base };
                Object.keys(lim).forEach(key => candidate[key] = (candidate[key] || []).slice(0, lim[key]));
                try {
                    if(JSON.stringify(candidate).length < 45000) return candidate;
                } catch(e) {}
            }

            return {
                ...base,
                pegawai: (base.pegawai || []).slice(0, 80),
                jurnal: [],
                pengumuman: (base.pengumuman || []).slice(0, 20),
                rencana: (base.rencana || []).slice(0, 20),
                survei: [],
                agenda: (base.agenda || []).slice(0, 20)
            };
        }

        let cloudDataCacheSaveTimer = null;
        function scheduleSaveDataCacheToCloud(cache) {
            if(!SCRIPT_URL || !cache || !hasUsableCachePayload(cache)) return;
            clearTimeout(cloudDataCacheSaveTimer);
            cloudDataCacheSaveTimer = setTimeout(() => {
                try {
                    const compact = compactForCloudCache(cache);
                    postToScript('save_data_cache', {
                        fingerprint: getArikaDeviceFingerprint(),
                        dataCache: compact,
                        updatedAt: new Date().toISOString()
                    }).catch(err => console.warn('Save data cache cloud gagal:', err));
                } catch(e) {}
            }, 600);
        }

        function safeBtoaUnicode(str) {
            return btoa(unescape(encodeURIComponent(str)));
        }

        function safeAtobUnicode(str) {
            return decodeURIComponent(escape(atob(str)));
        }

        function setCookieSession(raw) {
            try {
                const encoded = safeBtoaUnicode(raw);
                const maxAge = 7 * 24 * 60 * 60; // 7 hari
                document.cookie = `${ARIKA_SESSION_KEY}=${encoded}; max-age=${maxAge}; path=/; SameSite=Lax`;
            } catch(e) {}
        }

        function getCookieSessionByKey(key) {
            try {
                const prefix = key + '=';
                const parts = String(document.cookie || '').split(';').map(v => v.trim());
                const found = parts.find(v => v.indexOf(prefix) === 0);
                if(!found) return null;
                return normalizeSessionObject(JSON.parse(safeAtobUnicode(found.slice(prefix.length)) || 'null'));
            } catch(e) { return null; }
        }

        function setMemorySession(raw) {
            try { window.__ARIKA_SESSION_MEMORY__ = raw; } catch(e) {}
            try {
                const payload = JSON.parse(raw);
                if(payload && payload.__arikaSession === true) window.name = raw;
            } catch(e) {}
        }

        function readSessionFromWindowName() {
            try {
                const parsedName = JSON.parse(window.name || '{}');
                if (parsedName && parsedName.__arikaSession === true) return normalizeSessionObject(parsedName);
            } catch(e) {}
            return null;
        }

        function resolveWithTimeout(promise, ms = 2500, fallback = null) {
            return Promise.race([
                Promise.resolve(promise).catch(() => fallback),
                new Promise(resolve => setTimeout(() => resolve(fallback), ms))
            ]);
        }

        const ARIKA_IDB_NAME = 'ARIKA_SESSION_DB_V51';
        const ARIKA_IDB_STORE = 'sessions';

        function openArikaSessionDB() {
            return new Promise((resolve) => {
                if(!('indexedDB' in window)) return resolve(null);
                let settled = false;
                const done = (value) => {
                    if(settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(value || null);
                };
                const timer = setTimeout(() => done(null), 1200);

                let req;
                try {
                    req = indexedDB.open(ARIKA_IDB_NAME, 1);
                } catch(e) {
                    return done(null);
                }

                req.onupgradeneeded = (event) => {
                    try {
                        const db = event.target.result;
                        if(!db.objectStoreNames.contains(ARIKA_IDB_STORE)) {
                            db.createObjectStore(ARIKA_IDB_STORE, { keyPath: 'key' });
                        }
                    } catch(e) {}
                };
                req.onsuccess = () => done(req.result);
                req.onerror = () => done(null);
                req.onblocked = () => done(null);
            });
        }

        async function saveSessionToIndexedDB(key, raw) {
            try {
                const db = await openArikaSessionDB();
                if(!db) return;
                await new Promise((resolve) => {
                    const tx = db.transaction(ARIKA_IDB_STORE, 'readwrite');
                    tx.objectStore(ARIKA_IDB_STORE).put({ key, raw, updatedAt: Date.now() });
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                    tx.onabort = resolve;
                });
                try { db.close(); } catch(e) {}
            } catch(e) {}
        }

        async function readSessionFromIndexedDBByKey(key) {
            try {
                const db = await resolveWithTimeout(openArikaSessionDB(), 1500, null);
                if(!db) return null;
                const result = await resolveWithTimeout(new Promise((resolve) => {
                    try {
                        const tx = db.transaction(ARIKA_IDB_STORE, 'readonly');
                        const req = tx.objectStore(ARIKA_IDB_STORE).get(key);
                        req.onsuccess = () => resolve(req.result || null);
                        req.onerror = () => resolve(null);
                        tx.onabort = () => resolve(null);
                    } catch(e) {
                        resolve(null);
                    }
                }), 1200, null);
                try { db.close(); } catch(e) {}
                if(result && result.raw) return normalizeSessionObject(JSON.parse(result.raw));
            } catch(e) {}
            return null;
        }

        async function deleteSessionFromIndexedDB(key) {
            try {
                const db = await openArikaSessionDB();
                if(!db) return;
                await new Promise((resolve) => {
                    const tx = db.transaction(ARIKA_IDB_STORE, 'readwrite');
                    tx.objectStore(ARIKA_IDB_STORE).delete(key);
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                    tx.onabort = resolve;
                });
                try { db.close(); } catch(e) {}
            } catch(e) {}
        }

        function readLocalSession() {
            let session = null;

            try { session = normalizeSessionObject(JSON.parse(window.__ARIKA_SESSION_MEMORY__ || 'null')); } catch(e) {}

            if (!session) {
                try { session = readSessionFromStorage(localStorage, ARIKA_SESSION_KEY); } catch(e) {}
            }

            if (!session) {
                try { session = readSessionFromStorage(sessionStorage, ARIKA_SESSION_KEY); } catch(e) {}
            }

            if (!session) {
                session = getCookieSessionByKey(ARIKA_SESSION_KEY);
            }

            if (!session) {
                for (const oldKey of ARIKA_OLD_SESSION_KEYS) {
                    try { session = readSessionFromStorage(localStorage, oldKey); } catch(e) {}
                    if (session) break;
                    try { session = readSessionFromStorage(sessionStorage, oldKey); } catch(e) {}
                    if (session) break;
                    session = getCookieSessionByKey(oldKey);
                    if (session) break;
                }
            }

            if (!session) {
                session = readSessionFromWindowName();
            }

            return session;
        }

        async function readSessionAnyStorage() {
            let session = readLocalSession();
            if(session) return session;

            session = await readSessionFromIndexedDBByKey(ARIKA_SESSION_KEY);
            if(session) return session;

            for (const oldKey of ARIKA_OLD_SESSION_KEYS) {
                session = await readSessionFromIndexedDBByKey(oldKey);
                if(session) return session;
            }

            // Fallback terakhir: restore dari Apps Script berdasarkan sidik perangkat/browser.
            // Ini mengatasi Google Sites iframe yang kadang menghapus semua storage lokal saat reload.
            session = await restoreSessionFromCloud();
            if(session) return session;

            return null;
        }

        function persistSession(session) {
            const safeSession = normalizeSessionObject(session);
            if (!safeSession) return;
            const raw = JSON.stringify(safeSession);

            try { localStorage.setItem(ARIKA_SESSION_KEY, raw); } catch(e) {}
            try { sessionStorage.setItem(ARIKA_SESSION_KEY, raw); } catch(e) {}
            setCookieSession(raw);
            setMemorySession(raw);
            saveSessionToIndexedDB(ARIKA_SESSION_KEY, raw);
            scheduleSaveSessionToCloud(safeSession);
        }

        function clearSessionStorageAll() {
            try { localStorage.removeItem(ARIKA_SESSION_KEY); } catch(e) {}
            try { sessionStorage.removeItem(ARIKA_SESSION_KEY); } catch(e) {}
            deleteSessionFromIndexedDB(ARIKA_SESSION_KEY);
            (ARIKA_OLD_SESSION_KEYS || []).forEach(key => {
                try { localStorage.removeItem(key); } catch(e) {}
                try { sessionStorage.removeItem(key); } catch(e) {}
                try { document.cookie = `${key}=; max-age=0; path=/; SameSite=Lax`; } catch(e) {}
                deleteSessionFromIndexedDB(key);
            });
            try { document.cookie = `${ARIKA_SESSION_KEY}=; max-age=0; path=/; SameSite=Lax`; } catch(e) {}
            try { window.__ARIKA_SESSION_MEMORY__ = ''; } catch(e) {}
            deleteSessionFromCloud();
            try {
                const parsedName = JSON.parse(window.name || '{}');
                if (parsedName && parsedName.__arikaSession === true) window.name = '';
            } catch(e) {}
        }

        async function checkSession() {
            document.body.classList.add('arika-session-restoring');
            try {
                const session = await resolveWithTimeout(readSessionAnyStorage(), 8200, null);
                if (session && session.profile) {
                    persistSession(session);
                    window.__ARIKA_RESTORED_SESSION__ = session;
                    loginSetup(session.profile, !!session.isAdmin);
                    window.__ARIKA_RESTORED_SESSION__ = null;
                    document.body.classList.remove('arika-session-restoring');
                    return true;
                }
            } catch(err) {
                console.warn('Pemulihan session dilewati:', err);
            }
            window.__ARIKA_RESTORED_SESSION__ = null;
            document.body.classList.remove('arika-session-restoring');
            return false;
        }

        const withTimeout = (promise, ms = 2500, label = 'Proses terlalu lama') => {
            return Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms))
            ]);
        };

        async function createSession(profile, isAdminFlag = false) {
            try {
                persistSession({
                    profile,
                    isAdmin: !!isAdminFlag,
                    loginDate: getTodayKey(),
                    createdAt: new Date().toISOString(),
                    lastView: isAdminFlag ? 'admin' : 'beranda',
                    __arikaSession: true
                });
            } catch(e) {
                console.warn('Session lokal tidak bisa disimpan:', e);
            }
            return true;
        }

        function configureNavigationForRole(adminFlag) {
            if(!adminFlag) arikaRefreshCurrentUserRoleFromMaster();
            const effectiveProfile = arikaGetEffectivePegawaiProfile(window.currentUser || {});
            const reviewerFlag = !adminFlag && (window.isReviewer || isReviewerRoleValue(window.userRole) || isReviewerRoleValue(getPegawaiRoleValue(effectiveProfile)) || isNamedKetuaTim(effectiveProfile));
            const showAdminAccess = !!adminFlag || !!reviewerFlag;
            const userMenuIds = ['jurnal', 'lembur', 'rekap', 'dashboard-pegawai'];

            userMenuIds.forEach(id => {
                const btn = document.getElementById('btn-' + id);
                if (btn) btn.classList.toggle('hidden', !!adminFlag);

                const opt = document.querySelector(`#mobile-nav-select option[value="${id}"]`);
                if (opt) {
                    opt.hidden = !!adminFlag;
                    opt.disabled = !!adminFlag;
                }
            });

            const btnAdmin = document.getElementById('btn-admin-config');
            const optAdmin = document.getElementById('opt-admin');
            const accessLabel = adminFlag ? 'Admin' : getAccessPanelLabel(window.currentUser);
            if (btnAdmin) {
                btnAdmin.classList.toggle('hidden', !showAdminAccess);
                const textSpan = btnAdmin.querySelector('span:last-child');
                if(textSpan) textSpan.textContent = accessLabel;
                btnAdmin.title = adminFlag ? 'Panel Admin Utama' : `Panel ${accessLabel} Unit Binaan`;
            }
            if (optAdmin) {
                optAdmin.hidden = !showAdminAccess;
                optAdmin.disabled = !showAdminAccess;
                optAdmin.classList.toggle('hidden', !showAdminAccess);
                optAdmin.textContent = adminFlag ? '⚙️ Admin' : `🛡️ ${accessLabel}`;
            }

            const mobileSelect = document.getElementById('mobile-nav-select');
            if (mobileSelect) mobileSelect.value = adminFlag ? 'admin' : 'beranda';
        }

        function loginSetup(p, adminFlag) {
            p = adminFlag ? p : arikaGetEffectivePegawaiProfile(p);
            window.currentUser = p;
            window.isAdmin = !!adminFlag;
            window.userRole = adminFlag ? 'Admin Utama' : (isNamedKetuaTim(p) ? 'Ketua Tim' : getPegawaiRoleValue(p));
            window.isReviewer = !adminFlag && (isNamedKetuaTim(p) || isReviewerRoleValue(window.userRole));
            document.getElementById('main-nav').classList.remove('hidden');
            const welcome = document.getElementById('welcome-name');
            const welcomeSubtitle = document.getElementById('welcome-subtitle');
            const greetingTime = (typeof getSalamWaktu === 'function') ? getSalamWaktu() : 'Selamat datang';
            
            // Atur menu berdasarkan peran:
            // - Pegawai: Beranda, Isi Jurnal, Riwayat Jurnal, Laporan Lembur, Dashboard Saya, Panduan
            // - Admin: Beranda, Panduan, dan Admin saja
            configureNavigationForRole(adminFlag);

            // Saat session dipulihkan setelah reload, isi data langsung dari cache
            // sebelum request Apps Script selesai, sehingga tampilan tidak sempat kosong.
            hydrateFromCoreCache({ force: false });

            if (adminFlag) {
                if(welcome) welcome.innerText = `${greetingTime}, Administrator!`;
                if(welcomeSubtitle) welcomeSubtitle.innerText = 'Senang melihatmu kembali. Dashboard ARIKA siap membantu pemantauan dan pengelolaan hari ini.';
                const reminderBanner = document.getElementById('reminder-banner');
                if (reminderBanner) reminderBanner.classList.add('hidden');
                const restoredView = window.__ARIKA_RESTORED_SESSION__?.lastView;
                window.nav(['beranda', 'panduan', 'admin'].includes(restoredView) ? restoredView : 'admin');
                setTimeout(() => window.fetchLiveJurnalFromSheet && window.fetchLiveJurnalFromSheet({ silent: true, timeoutMs: 12000 }), 600);
            } else {
                const firstName = toTitleCase(String(p.nama || '').split(' ')[0] || 'Rekan ARIKA');
                const accessLabel = window.isReviewer ? getAccessPanelLabel(p) : '';
                const unitLabel = window.isReviewer && getVerifierUnitLabel() ? getVerifierUnitLabel() : '';
                if(welcome) welcome.innerText = `${greetingTime}, ${firstName}!`;
                if(welcomeSubtitle) {
                    welcomeSubtitle.innerText = window.isReviewer
                        ? `Senang melihatmu kembali. Akses ${accessLabel}${unitLabel ? ' untuk ' + unitLabel : ''} sudah aktif, siap memantau jurnal dan agenda hari ini.`
                        : 'Senang melihatmu kembali. Yuk pantau jurnal, reminder, pengumuman, dan agenda penting hari ini.';
                }
                
                // Isi input display form jurnal harian
                const dName = document.getElementById('user-display-name');
                const dNip = document.getElementById('user-display-nip');
                const dStatus = document.getElementById('user-display-status');
                
                if(dName) dName.value = p.nama.toUpperCase();
                if(dNip) dNip.value = p.nip || '-';
                if(dStatus) dStatus.value = p.status || '-';
                
                // 🔔 TRIGGER NOTIFIKASI REMINDER
                triggerDailyReminder();
                window.renderRencanaPribadi();
                window.updateHomeModernStats && window.updateHomeModernStats();
                window.renderAgendaSaya();
                updateArikaReminderSoundPanel && updateArikaReminderSoundPanel();
                window.startArikaReminderSoundWatcher && window.startArikaReminderSoundWatcher();
                window.startArikaReminderCenter && window.startArikaReminderCenter();
                setTimeout(() => window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'login-setup' }), 1500);

                const restoredView = window.__ARIKA_RESTORED_SESSION__?.lastView;
                const allowedViews = ['beranda', 'jurnal', 'lembur', 'rekap', 'dashboard-pegawai', 'panduan'];
                window.nav(allowedViews.includes(restoredView) ? restoredView : 'beranda');
                setTimeout(() => window.fetchCloudData && window.fetchCloudData({ force: false, full: false }), window.ARIKA_PERFORMANCE_MODE ? 2200 : 900);
                setTimeout(() => window.fetchLiveJurnalFromSheet && window.fetchLiveJurnalFromSheet({ silent: true, timeoutMs: 12000 }), window.ARIKA_PERFORMANCE_MODE ? 9000 : 1200);
            }
        }

        // --- FUNGSI UPDATE LEADERBOARD KONTRIBUTOR ---
        function getSurveyMonthlyAverage(monthVal = null) {
            const currentMonth = monthVal || (getCurrentMonth ? getCurrentMonth() : new Date().toISOString().slice(0, 7));
            const rows = (window.surveiData || []).filter(s => String(s.bulan || '').slice(0, 7) === currentMonth);
            const values = [];
            rows.forEach(s => {
                ['kemudahan', 'kemanfaatan', 'efisiensi', 'kepuasan'].forEach(key => {
                    const val = Number(s[key] || 0);
                    if(val > 0) values.push(val);
                });
            });
            const avg = values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
            return { monthVal: currentMonth, rows, avg };
        }

        function updateSurveyHomeAverage() {
            const box = document.getElementById('survey-home-average-summary');
            if(!box) return;
            const { rows, avg } = getSurveyMonthlyAverage();
            const avgText = avg ? `${avg.toFixed(1)}/5` : 'Belum ada';
            const descText = rows.length
                ? `${rows.length} responden sudah memberi masukan bulan ini.`
                : 'Belum ada respon survei bulan ini.';
            box.innerHTML = `
                <div class="flex justify-between items-center gap-2">
                    <span class="text-[10px] font-black text-slate-700 uppercase tracking-widest">📊 Rata-rata Survei Bulan Ini</span>
                    <span class="font-black text-cyan-700 text-[9px] bg-white/80 px-2 py-1 rounded-lg">${avgText}</span>
                </div>
                <p class="mt-2 text-[9px] font-bold text-slate-500 leading-relaxed">${escapeHTML(descText)}</p>
            `;
        }

        function getLabDisplayName(lab) {
            const key = canonicalLabKey(lab);
            const map = {
                kimiapangan: 'Kimia Pangan',
                kimiaoba: 'Kimia OBA',
                kimiaobnaz: 'Kimia Obnaz',
                kimiakosmetik: 'Kimia Kosmetik',
                mikrobiologi: 'Mikrobiologi'
            };
            return map[key] || (lab ? toTitleCase(String(lab).replace(/^staf fungsi pengujian\s+/i, '')) : 'Fungsi Belum Terisi');
        }

        function buildContributorScores(rows, groupBy = 'pegawai') {
            const stats = {};
            (rows || []).forEach(d => {
                const key = groupBy === 'fungsi'
                    ? (canonicalLabKey(d.lab) || normalize(d.lab) || 'tanpalab')
                    : (d.name || 'Tanpa Nama');

                const displayName = groupBy === 'fungsi' ? getLabDisplayName(d.lab) : (d.name || 'Tanpa Nama');

                if(!stats[key]) {
                    stats[key] = { key, name: displayName, total: 0, selesai: 0, lembur: 0, days: new Set(), score: 0 };
                }

                stats[key].total += 1;
                if(normalize(d.status) === normalize('Selesai')) stats[key].selesai += 1;
                if(d.isLembur) stats[key].lembur += 1;
                if(d.date) stats[key].days.add(d.date);
            });

            return Object.values(stats).map(item => {
                item.score = (item.total * 2) + (item.selesai * 2) + (item.days.size * 3) + item.lembur;
                return item;
            }).sort((a,b) => b.score - a.score || b.total - a.total || a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
        }

        function renderSimpleContributorRows(items, iconList) {
            if(!items.length) {
                return '<p class="text-center py-3 opacity-50 uppercase text-[9px] font-black tracking-widest text-slate-400">Belum ada data</p>';
            }
            return items.map((item, i) => {
                const icon = iconList[i] || '⭐';
                return `<div class="p-3 bg-gradient-to-r from-emerald-50 to-cyan-50 rounded-2xl border border-emerald-100 text-left shadow-sm">
                    <div class="flex justify-between items-center gap-3">
                        <span class="text-[10px] font-black text-slate-700 truncate uppercase">${icon} ${i+1}. ${escapeHTML(item.name)}</span>
                        <span class="font-black text-emerald-700 text-[9px] bg-white/80 px-2 py-1 rounded-lg shrink-0">Skor ${item.score}</span>
                    </div>
                </div>`;
            }).join('');
        }

        function updateLeaderboard() {
            const currentMonth = getCurrentMonth ? getCurrentMonth() : new Date().toISOString().slice(0, 7);
            const monthRows = (window.arikaData || []).filter(d => d.date && d.date.startsWith(currentMonth));

            const topPegawai = buildContributorScores(monthRows, 'pegawai').slice(0, 3);
            const topFungsi = buildContributorScores(monthRows, 'fungsi').slice(0, 3);

            const list = document.getElementById('leaderboard-list');
            if(list) {
                const pegawaiHtml = renderSimpleContributorRows(topPegawai, ['🥇','🥈','🥉']);
                const fungsiHtml = renderSimpleContributorRows(topFungsi, ['🏅','🏅','🏅']);

                list.innerHTML = `
                    <div>
                        <div class="mb-2 flex items-center justify-between gap-2">
                            <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">3 Pegawai Teraktif</span>
                            <span class="text-[8px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Bulan Ini</span>
                        </div>
                        <div class="space-y-3">${pegawaiHtml}</div>
                    </div>
                    <div class="pt-2">
                        <div class="mb-2 flex items-center justify-between gap-2">
                            <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">3 Fungsi Teraktif</span>
                            <span class="text-[8px] font-black uppercase tracking-widest text-cyan-600 bg-cyan-50 px-2 py-1 rounded-full">Nama & Skor</span>
                        </div>
                        <div class="space-y-3">${fungsiHtml}</div>
                    </div>
                `;
            }

            updateSurveyHomeAverage();
            window.updateHomeModernStats && window.updateHomeModernStats();
        }

        // --- CACHE DATA LOKAL UNTUK STATE/DATA PERSISTENCE ---
        // Tujuan: setelah reload, data lama langsung ditampilkan dari cache terlebih dahulu,
        // lalu data terbaru disinkronkan di belakang layar (stale-while-revalidate).
        const ARIKA_DATA_CACHE_KEY = 'arika_data_cache_v98';
        const ARIKA_DATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam, agar reload tidak kosong

        function hasUsableCachePayload(cache) {
            if(!cache || typeof cache !== 'object') return false;
            return ['pegawai', 'jurnal', 'pengumuman', 'rencana', 'survei', 'agenda', 'kalenderLibur'].some(key => Array.isArray(cache[key]) && cache[key].length > 0);
        }

        function readCacheFromStorage(storage, key) {
            try {
                const raw = storage.getItem(key);
                if(!raw) return null;
                return JSON.parse(raw);
            } catch(_) {
                return null;
            }
        }

        function loadLocalCoreCache(options = {}) {
            const allowStale = options.allowStale !== false;
            let cache = null;
            try { cache = readCacheFromStorage(localStorage, ARIKA_DATA_CACHE_KEY); } catch(_) {}
            if(!cache) {
                try { cache = readCacheFromStorage(sessionStorage, ARIKA_DATA_CACHE_KEY); } catch(_) {}
            }
            if(!cache && hasUsableCachePayload(window.__ARIKA_CLOUD_DATA_CACHE__)) {
                cache = window.__ARIKA_CLOUD_DATA_CACHE__;
            }

            // Migrasi cache lama yang hanya menyimpan pegawai+jurnal, jika ada.
            if(!cache) {
                try { cache = readCacheFromStorage(localStorage, 'arika_core_cache_v36'); } catch(_) {}
            }
            if(!cache) {
                try { cache = readCacheFromStorage(sessionStorage, 'arika_core_cache_v36'); } catch(_) {}
            }

            if(!hasUsableCachePayload(cache)) return null;
            const age = Date.now() - Number(cache.ts || 0);
            if(!allowStale && age > ARIKA_DATA_CACHE_TTL_MS) return null;
            return cache;
        }

        function clearLocalCoreCache() {
            try { localStorage.removeItem(ARIKA_DATA_CACHE_KEY); } catch(_) {}
            try { sessionStorage.removeItem(ARIKA_DATA_CACHE_KEY); } catch(_) {}
            try { delete window.__ARIKA_CLOUD_DATA_CACHE__; } catch(_) { window.__ARIKA_CLOUD_DATA_CACHE__ = null; }
        }

        function compactForStorage(cache) {
            const out = { ...cache };
            // Batasi agar tidak melewati kuota localStorage Google Sites/iframe.
            out.jurnal = (out.jurnal || []).slice(0, 900);
            out.rencana = applyRencanaDeleteTombstones(out.rencana || []).slice(0, 600);
            out.survei = (out.survei || []).slice(0, 600);
            out.agenda = (out.agenda || []).slice(0, 500);
            out.pengumuman = (out.pengumuman || []).slice(0, 300);
            out.kalenderLibur = (out.kalenderLibur || []).slice(0, 900);
            return out;
        }

        function saveLocalCoreCache() {
            const cache = compactForStorage({
                version: 'v51',
                ts: Date.now(),
                rencanaCloudAuthority: true,
                pegawai: window.masterPegawai || [],
                jurnal: window.arikaData || [],
                pengumuman: window.pengumumanData || [],
                rencana: window.rencanaData || [],
                survei: window.surveiData || [],
                agenda: window.agendaData || [],
                kalenderLibur: window.kalenderLiburData || []
            });

            try {
                const raw = JSON.stringify(cache);
                localStorage.setItem(ARIKA_DATA_CACHE_KEY, raw);
                sessionStorage.setItem(ARIKA_DATA_CACHE_KEY, raw);
            } catch(err) {
                // Fallback lebih kecil jika cache utama terlalu besar.
                try {
                    cache.jurnal = (cache.jurnal || []).slice(0, 350);
                    cache.rencana = (cache.rencana || []).slice(0, 250);
                    cache.survei = (cache.survei || []).slice(0, 250);
                    cache.agenda = (cache.agenda || []).slice(0, 250);
                    cache.kalenderLibur = (cache.kalenderLibur || []).slice(0, 400);
                    const rawSmall = JSON.stringify(cache);
                    localStorage.setItem(ARIKA_DATA_CACHE_KEY, rawSmall);
                    sessionStorage.setItem(ARIKA_DATA_CACHE_KEY, rawSmall);
                } catch(_) {}
            }

            scheduleSaveDataCacheToCloud(cache);
        }

        function renderCurrentDataState(options = {}) {
            const syncEl = document.getElementById('sync-status');
            try {
                if(window.masterPegawai && window.masterPegawai.length) window.populateLoginDropdown();
                updateLeaderboard();
                window.renderPengumumanBoard && window.renderPengumumanBoard();
                window.renderRencanaPribadi && window.renderRencanaPribadi();
                window.renderAgendaSaya && window.renderAgendaSaya();
                window.renderSurveiPegawai && window.renderSurveiPegawai();

                if(window.currentUser) {
                    triggerDailyReminder();
                    if(typeof window.runFilter === 'function') window.runFilter();
                    if(typeof window.renderVisualCalendar === 'function') window.renderVisualCalendar();
                    if(!window.isAdmin && typeof window.renderDashboardPegawai === 'function') window.renderDashboardPegawai({ fromDataRefresh: true });
                    if(!window.isAdmin && typeof window.renderJurnalReviewAlert === 'function') window.renderJurnalReviewAlert();
                }

                if(window.isAdmin) {
                    try { window.renderAdminPengumuman && window.renderAdminPengumuman(); } catch(e) { console.warn('Pengumuman admin gagal render:', e); }
                    try { window.renderAdminAgenda && window.renderAdminAgenda(); } catch(e) { console.warn('Agenda admin gagal render:', e); }
                    try { window.renderAdminAllTable && window.renderAdminAllTable(); } catch(e) { console.warn('Rekap semua pegawai gagal render:', e); }
                    try { window.renderAdminAnalytics && window.renderAdminAnalytics(); } catch(e) { console.warn('Analitik admin gagal render:', e); }
                    try { window.renderAdminOvertimeDashboard && window.renderAdminOvertimeDashboard({ fromDataRefresh: true }); } catch(e) { console.warn('Dashboard lembur gagal render:', e); }
                }

                if(options.fromCache && syncEl) {
                    syncEl.innerText = 'Data tersimpan ditampilkan';
                    syncEl.className = 'text-[8px] md:text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer hover:bg-amber-100 transition-colors';
                }
            } catch(err) {
                console.warn('Render data cache dilewati:', err);
            }
        }

        function hydrateFromCoreCache(options = {}) {
            const cache = loadLocalCoreCache({ allowStale: true });
            if(!cache) return false;
            const force = !!options.force;
            const fillIfEmpty = (key, value) => {
                if(force || !Array.isArray(window[key]) || window[key].length === 0) {
                    window[key] = Array.isArray(value) ? value : [];
                }
            };

            fillIfEmpty('masterPegawai', cache.pegawai);
            fillIfEmpty('arikaData', cache.jurnal);
            fillIfEmpty('pengumumanData', cache.pengumuman || loadLocalPengumuman());
            const cacheRencana = cache.rencanaCloudAuthority === true ? (cache.rencana || []) : [];
            fillIfEmpty('rencanaData', applyRencanaDeleteTombstones(dedupeRencanaList([...(cacheRencana || []), ...loadLocalRencana()])));
            fillIfEmpty('surveiData', cache.survei || loadLocalSurvei());
            fillIfEmpty('agendaData', cache.agenda);
            fillIfEmpty('kalenderLiburData', cache.kalenderLibur);

            renderCurrentDataState({ fromCache: true });
            return true;
        }

        // --- SINKRONISASI DATA DENGAN MAPPING PINTAR ---
        window.fetchCloudData = async function(options = {}) {
            if (!SCRIPT_URL) return;
            const forceFresh = !!options.force;
            const fullFetch = !!options.full || window.isAdmin === true;
            const skipCacheForFresh = !!(forceFresh && fullFetch);
            if(window.__ARIKA_FETCHING_CLOUD__) return;
            // Jangan hapus cache di awal. Cache baru diganti setelah data dari Sheet berhasil terbaca.
            window.__ARIKA_FETCHING_CLOUD__ = true;
            const syncEl = document.getElementById('sync-status');
            if(syncEl) syncEl.innerText = "⚡ Sinkron data...";

            // 1) Tampilkan cache terlebih dahulu agar setelah reload UI tidak kosong.
            // v162: Force pegawai tetap memakai cache lokal lebih dulu; cache hanya dilewati untuk fetch penuh admin.
            let hasCachedData = skipCacheForFresh ? false : hydrateFromCoreCache({ force: false });
            if(hasCachedData && syncEl) syncEl.innerText = 'Menampilkan data tersimpan...';
            if(!skipCacheForFresh && !hasCachedData && window.currentUser) {
                updateSyncStatus('Memulihkan data...', 'info');
                const cloudCache = await restoreDataCacheFromCloud();
                if(cloudCache) {
                    hasCachedData = hydrateFromCoreCache({ force: true });
                    if(hasCachedData) updateSyncStatus('Cache cloud tampil', 'warn');
                }
            }

            const fetchJsonWithTimeout = async (url, timeoutMs = 5000) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return await response.json();
                } finally {
                    clearTimeout(timer);
                }
            };

            const fetchWithRetry = async (url, retries = 1, delay = 800) => {
                for (let i = 0; i < retries; i++) {
                    const cleanUrl = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now() + '&try=' + i;
                    try {
                        return await fetchJsonWithTimeout(cleanUrl, window.ARIKA_PERFORMANCE_MODE ? 11000 : 18000);
                    } catch (err) {
                        if (i === retries - 1) throw err;
                        await new Promise(res => setTimeout(res, delay));
                    }
                }
            };

            const loginStatus = document.getElementById('login-status-msg');
            const loginSelect = document.getElementById('login-user-select');
            const setLoginMessage = (msg, type = 'info') => {
                if (!loginStatus) return;
                loginStatus.innerText = msg;
                loginStatus.classList.remove('hidden', 'text-rose-500', 'text-emerald-600', 'text-slate-500');
                loginStatus.classList.add(type === 'error' ? 'text-rose-500' : (type === 'success' ? 'text-emerald-600' : 'text-slate-500'));
            };
            const mapPegawai = (arr) => (arr || []).map(p => ({
                id: getVal(p, ['id', 'id_unik', 'id unik', 'unique_id', 'id_pegawai', 'ID Unik']) || '',
                nama: (getVal(p, ['nama', 'Nama', 'nama_pegawai', 'nama pegawai', 'pelaksana', 'name']) || '').toString(),
                nip: (getVal(p, ['nip', 'NIP', 'nip_pegawai', 'nip pegawai', 'id_pegawai']) || '').toString(),
                status: getVal(p, ['status', 'Status', 'status_pegawai', 'status pegawai', 'kepegawaian']) || 'PNS',
                lab: getVal(p, ['lab', 'Lab', 'laboratorium', 'fungsi', 'Fungsi Kerja', 'fungsi_kerja', 'fungsi kerja']) || '',
                pangkat: getVal(p, ['pangkat', 'Pangkat', 'golongan', 'pangkat/golongan', 'pangkat_golongan']) || '',
                peran: getVal(p, ['peran', 'Peran', 'role', 'Role', 'hak akses', 'Hak Akses', 'akses', 'Akses', 'kewenangan', 'Kewenangan', 'jabatan tugas', 'Jabatan Tugas']) || 'Pegawai',
                cakupanUnit: getVal(p, ['cakupan unit', 'Cakupan Unit', 'unit binaan', 'Unit Binaan', 'cakupan fungsi', 'Cakupan Fungsi', 'fungsi binaan', 'Fungsi Binaan', 'scope', 'Scope']) || ''
            })).filter(p => p.nama && p.nama.toString().trim() !== "");

            try {
                // Tahap 1: ambil daftar pegawai saja agar dropdown login tidak menunggu data jurnal/monev.
                // Jika Apps Script v12 sudah dipasang, mode=login hanya membaca sheet Pegawai sehingga jauh lebih cepat.
                try {
                    if (loginSelect && !window.masterPegawai.length) {
                        loginSelect.innerHTML = '<option value="" disabled selected>-- Memuat daftar pegawai... --</option>';
                    }
                    const loginData = await fetchWithRetry(SCRIPT_URL + (SCRIPT_URL.includes('?') ? '&' : '?') + 'mode=login&maxRows=0', 1, 300);
                    if (loginData && Array.isArray(loginData.pegawai) && loginData.pegawai.length) {
                        window.masterPegawai = mapPegawai(loginData.pegawai);
                        window.populateLoginDropdown();
                        try { arikaForceRoleUiSync && arikaForceRoleUiSync(); arikaSyncEmbedDock && arikaSyncEmbedDock(); } catch(e) {}
                        setLoginMessage('Daftar pegawai berhasil dimuat. Silakan login.', 'success');
                        setTimeout(() => { if (loginStatus) loginStatus.classList.add('hidden'); }, 2500);
                    }
                } catch (loginErr) {
                    console.warn('Mode login cepat gagal, mencoba mode data ringkas:', loginErr);
                    if (!window.masterPegawai.length) setLoginMessage('Mode cepat belum merespons. Mencoba membaca database ringkas...', 'info');
                }

                // Tahap 2: ambil data utama dari Google Sheet.
                // Admin memakai full=true agar Rekap Jurnal Pegawai sesuai dengan backup Google Sheet,
                // termasuk setelah pegawai mengedit/menghapus jurnal.
                const dataQuery = fullFetch
                    ? `mode=core&full=true&maxRows=3000&_=${Date.now()}`
                    : `mode=core&maxRows=1500&days=365&_=${Date.now()}`;
                const data = await fetchWithRetry(SCRIPT_URL + (SCRIPT_URL.includes('?') ? '&' : '?') + dataQuery, 1, 300);
                
                // Deep Mapping Pegawai 
                if (data && data.pegawai && Array.isArray(data.pegawai)) {
                    window.masterPegawai = mapPegawai(data.pegawai);
                    window.populateLoginDropdown();
                    try { arikaForceRoleUiSync && arikaForceRoleUiSync(); arikaSyncEmbedDock && arikaSyncEmbedDock(); } catch(e) {}
                }

                // Deep Mapping Jurnal
                if (data && data.jurnal && Array.isArray(data.jurnal)) {
                    const mappedJurnal = mapJurnalRowsFromSheet(data.jurnal);
                    if(mappedJurnal.length || data.jurnal.length === 0 && !hasMeaningfulDataLoaded()) {
                        window.arikaData = mappedJurnal;
                    } else if(mappedJurnal.length === 0 && (window.arikaData || []).length > 0) {
                        console.warn('Jurnal dari server kosong, data layar lama dipertahankan agar tidak hilang.');
                    }
                }

                if (data && data.pengumuman && Array.isArray(data.pengumuman)) {
                    window.pengumumanData = data.pengumuman.map((p, idx) => ({
                        id: (getVal(p, ['id', 'id_pengumuman', 'timestamp']) || `pengumuman-${idx}`).toString(),
                        judul: (getVal(p, ['judul', 'title']) || '').toString(),
                        isi: (getVal(p, ['isi', 'pesan', 'message', 'deskripsi']) || '').toString(),
                        jenis: (getVal(p, ['jenis', 'kategori', 'type']) || 'Informasi').toString(),
                        mulai: (getVal(p, ['mulai', 'tanggal_mulai', 'tanggal mulai', 'startDate', 'start']) || '').toString().split('T')[0],
                        selesai: (getVal(p, ['selesai', 'tanggal_selesai', 'tanggal selesai', 'endDate', 'end']) || '').toString().split('T')[0],
                        waktuMulai: extractTime(getVal(p, ['waktuMulai', 'waktu_mulai', 'waktu mulai', 'Waktu Mulai', 'jamMulai', 'jam_mulai', 'jam mulai', 'Jam Mulai']) || ''),
                        targetFungsi: (getVal(p, ['targetFungsi', 'target_fungsi', 'target fungsi', 'Target Fungsi', 'fungsi tujuan', 'ditujukan untuk', 'Ditujukan Untuk']) || 'Semua').toString(),
                        aktif: !['false', '0', 'tidak', 'nonaktif'].includes(String(getVal(p, ['aktif', 'isActive', 'status']) ?? 'true').toLowerCase())
                    })).filter(p => p.judul || p.isi);
                    saveLocalPengumuman(window.pengumumanData);
                } else {
                    window.pengumumanData = loadLocalPengumuman();
                }

                if (data && data.rencana && Array.isArray(data.rencana)) {
                    const mappedRencana = data.rencana.map((r, idx) => ({
                        id: (getVal(r, ['id', 'id_rencana', 'timestamp']) || `rencana-${idx}`).toString(),
                        ownerName: (getVal(r, ['ownerName', 'nama', 'nama_pegawai', 'pegawai', 'name']) || '').toString(),
                        ownerNip: (getVal(r, ['ownerNip', 'nip', 'nip_pegawai']) || '').toString(),
                        tanggal: (getVal(r, ['tanggal', 'date', 'tgl']) || '').toString().split('T')[0],
                        jamReminder: extractTime(getVal(r, ['jamReminder', 'jam_reminder', 'jam reminder', 'waktuReminder', 'waktu_reminder', 'waktu reminder', 'jam', 'waktu']) || ''),
                        periode: (getVal(r, ['periode', 'jenis', 'type']) || 'Reminder').toString(),
                        judul: (getVal(r, ['judul', 'rencana', 'kegiatan', 'title']) || '').toString(),
                        catatan: (getVal(r, ['catatan', 'detail', 'deskripsi', 'note']) || '').toString(),
                        status: (getVal(r, ['status']) || 'Aktif').toString(),
                        createdAt: (getVal(r, ['createdAt', 'timestamp']) || '').toString(),
                        syncStatus: 'synced'
                    })).filter(r => r.judul || r.catatan);
                    applyCloudRencanaData(mappedRencana);
                } else {
                    const stableRencana = getStableRencanaData();
                    if(stableRencana.length > 0) {
                        window.rencanaData = stableRencana;
                        saveLocalRencana(window.rencanaData);
                    }
                }

                if (data && data.survei && Array.isArray(data.survei)) {
                    window.surveiData = data.survei.map((s, idx) => ({
                        id: (getVal(s, ['id', 'id_survei', 'timestamp']) || `survei-${idx}`).toString(),
                        bulan: (getVal(s, ['bulan', 'periode', 'month']) || '').toString().slice(0, 7),
                        nama: (getVal(s, ['nama', 'name', 'pegawai']) || '').toString(),
                        nip: (getVal(s, ['nip']) || '').toString(),
                        lab: (getVal(s, ['lab', 'fungsi', 'fungsi kerja', 'laboratorium']) || '').toString(),
                        statusPegawai: (getVal(s, ['statusPegawai', 'status pegawai', 'status']) || '').toString(),
                        kemudahan: Number(getVal(s, ['kemudahan']) || 0),
                        kemanfaatan: Number(getVal(s, ['kemanfaatan']) || 0),
                        efisiensi: Number(getVal(s, ['efisiensi']) || 0),
                        kepuasan: Number(getVal(s, ['kepuasan']) || 0),
                        penilaianUmum: (getVal(s, ['penilaianUmum', 'penilaian umum', 'penilaian']) || '').toString(),
                        fiturTerbantu: (getVal(s, ['fiturTerbantu', 'fitur terbantu', 'fitur']) || '').toString(),
                        kendala: (getVal(s, ['kendala']) || '').toString(),
                        saran: (getVal(s, ['saran']) || '').toString(),
                        createdAt: (getVal(s, ['createdAt', 'timestamp']) || '').toString()
                    })).filter(s => s.bulan && (s.nama || s.nip));
                    saveLocalSurvei(window.surveiData);
                } else {
                    window.surveiData = loadLocalSurvei();
                }

                if (data && data.agenda && Array.isArray(data.agenda)) {
                    window.agendaData = data.agenda.map((a, idx) => ({
                        id: (getVal(a, ['id', 'id_agenda', 'timestamp']) || `agenda-${idx}`).toString(),
                        judul: (getVal(a, ['judul', 'title', 'nama agenda']) || '').toString(),
                        jenis: (getVal(a, ['jenis', 'kategori', 'type']) || 'Agenda').toString(),
                        tanggal: (getVal(a, ['tanggal', 'date', 'tgl']) || '').toString().split('T')[0],
                        waktuMulai: extractTime(getVal(a, ['waktuMulai', 'waktu_mulai', 'waktu mulai', 'Waktu Mulai', 'jamMulai', 'jam mulai', 'Jam Mulai']) || ''),
                        lokasi: (getVal(a, ['lokasi', 'tempat', 'media']) || '').toString(),
                        keterangan: (getVal(a, ['keterangan', 'catatan', 'deskripsi', 'isi']) || '').toString(),
                        pesertaNip: (getVal(a, ['pesertaNip', 'peserta_nip', 'peserta nip', 'NIP Peserta']) || '').toString(),
                        pesertaNama: (getVal(a, ['pesertaNama', 'peserta_nama', 'peserta nama', 'Nama Peserta']) || '').toString(),
                        aktif: !['false', '0', 'tidak', 'nonaktif'].includes(String(getVal(a, ['aktif', 'status']) ?? 'true').toLowerCase()),
                        createdAt: (getVal(a, ['createdAt', 'created_at', 'timestamp']) || '').toString()
                    })).filter(a => a.judul || a.keterangan);
                } else {
                    window.agendaData = window.agendaData || [];
                }

                if (data && data.kalenderLibur && Array.isArray(data.kalenderLibur)) {
                    window.kalenderLiburData = data.kalenderLibur.map((k, idx) => ({
                        id: (getVal(k, ['id', 'ID', 'id_libur']) || `libur-${idx}`).toString(),
                        tanggal: (getVal(k, ['tanggal', 'Tanggal', 'date', 'tgl']) || '').toString().split('T')[0],
                        jenis: (getVal(k, ['jenis', 'Jenis', 'tipe', 'type']) || 'Libur Nasional').toString(),
                        keterangan: (getVal(k, ['keterangan', 'Keterangan', 'nama', 'Nama', 'label', 'Label', 'deskripsi']) || '').toString(),
                        aktif: !['false', '0', 'tidak', 'nonaktif'].includes(String(getVal(k, ['aktif', 'Aktif', 'status', 'Status']) ?? 'true').toLowerCase())
                    })).filter(k => k.tanggal && k.aktif !== false);
                } else {
                    window.kalenderLiburData = window.kalenderLiburData || [];
                }

                // Simpan snapshot data terbaru ke cache sebelum render ulang.
                saveLocalCoreCache();
                renderCurrentDataState({ fromCache: false });
                
                if(syncEl) {
                    syncEl.innerText = "Database Sinkron";
                    syncEl.className = "text-[8px] md:text-[10px] font-bold text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer hover:bg-emerald-100 transition-colors";
                }
                window.__ARIKA_FETCHING_CLOUD__ = false;
            } catch (error) { 
                console.error("Sinkronisasi gagal:", error);
                const loginStatus = document.getElementById('login-status-msg');
                const loginSelect = document.getElementById('login-user-select');
                if (!window.masterPegawai.length && loginSelect) {
                    loginSelect.innerHTML = '<option value="" disabled selected>-- Database belum terbaca, klik Muat Ulang --</option>';
                    if (loginStatus) {
                        loginStatus.innerText = 'Database belum berhasil dimuat. Pastikan Apps Script sudah deploy versi terbaru, lalu klik Muat Ulang.';
                        loginStatus.classList.remove('hidden', 'text-emerald-600', 'text-slate-500');
                        loginStatus.classList.add('text-rose-500');
                    }
                }
                if(syncEl) {
                    if(loadLocalCoreCache({ allowStale: true })) {
                        syncEl.innerText = "Data cache aktif";
                        syncEl.className = "text-[8px] md:text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer";
                    } else {
                        syncEl.innerText = "Gagal Sinkron";
                        syncEl.className = "text-[8px] md:text-[10px] font-bold text-rose-500 bg-rose-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer";
                    }
                }
                window.__ARIKA_FETCHING_CLOUD__ = false;
                if(window.currentUser && !hasMeaningfulDataLoaded()) {
                    scheduleBackgroundDataSync('catch-empty');
                }
            }
        };

        window.fetchLiveJurnalFromSheet = async function(options = {}) {
            if(!SCRIPT_URL) return false;
            const silent = !!options.silent;
            const timeoutMs = Number(options.timeoutMs || 12000);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                if(!silent) updateSyncStatus('Mengambil jurnal terbaru...', 'info');
                const url = SCRIPT_URL + (SCRIPT_URL.includes('?') ? '&' : '?') + `mode=jurnal_live&full=true&maxRows=6000&_=${Date.now()}`;
                const response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
                if(!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if(data && Array.isArray(data.jurnal)) {
                    const mappedJurnal = applyJurnalDeleteTombstones(mapJurnalRowsFromSheet(data.jurnal));
                    if(mappedJurnal.length > 0 || (window.arikaData || []).length === 0) {
                        window.arikaData = mappedJurnal;
                        saveLocalCoreCache();
                        renderCurrentDataState({ fromCache: false });
                        if(!silent) updateSyncStatus('Jurnal sesuai Google Sheet', 'ok');
                        return true;
                    }
                    console.warn('Jurnal live kosong, data layar lama dipertahankan.');
                    return false;
                }
                return false;
            } catch(err) {
                console.warn('Fetch live jurnal gagal:', err);
                if(!silent) updateSyncStatus('Jurnal live gagal', 'warn');
                return false;
            } finally {
                clearTimeout(timer);
            }
        };

        window.reloadLoginAndCoreData = async function() {
            window.showLoader(true, 'Memuat ulang daftar pegawai...');
            try {
                // Sinkron ringan: jangan full database dari tombol login.
                await window.fetchCloudData({ force: true, full: false });
                updateSyncStatus('Data ringan sinkron', 'ok');
            } catch(err) {
                console.warn('Reload login/core gagal:', err);
                const restored = hydrateFromCoreCache({ force: false });
                if(!restored) window.showCustomAlert('Data belum berhasil dimuat. Pastikan Apps Script sudah deploy versi terbaru, lalu coba refresh halaman.');
            } finally {
                setJurnalSavingState(false, false);
                window.showLoader(false);
            }
        };

        window.forceSyncFromSheet = async function(options = {}) {
            const silent = !!options.silent;
            if(!silent) window.showLoader(true, 'Menyinkronkan data terbaru dari Google Sheet...');
            try {
                await window.fetchCloudData({ force: true, full: !!window.isAdmin });
                await window.fetchLiveJurnalFromSheet({ silent: true, timeoutMs: 18000 });
                saveLocalCoreCache();
                renderCurrentDataState();
                updateSyncStatus('Data sesuai Google Sheet', 'ok');
            } catch(err) {
                console.warn('Force sync gagal:', err);
                const restored = hydrateFromCoreCache({ force: false });
                updateSyncStatus(restored ? 'Cache dipertahankan' : 'Sinkron gagal', restored ? 'warn' : 'err');
                if(!silent) window.showCustomAlert('Gagal sinkron data terbaru: ' + err.message);
            } finally {
                if(!silent) window.showLoader(false);
            }
        };

        function getSortedLoginPegawai() {
            return [...(window.masterPegawai || [])]
                .filter(p => p && p.nama)
                .sort((a,b) => (a.nama || '').localeCompare(b.nama || '', 'id', { sensitivity: 'base' }));
        }

        window.setLoginSelectedName = function(name) {
            const search = document.getElementById('login-user-search');
            const hidden = document.getElementById('login-user-select');
            const suggestions = document.getElementById('login-user-suggestions');
            if(search) search.value = name || '';
            if(hidden) hidden.value = name || '';
            if(suggestions) suggestions.classList.add('hidden');
        };

        window.filterLoginNameOptions = function() {
            const search = document.getElementById('login-user-search');
            const hidden = document.getElementById('login-user-select');
            const suggestions = document.getElementById('login-user-suggestions');
            if(!search || !suggestions) return;

            const query = normalize(search.value || '');
            if(hidden) hidden.value = '';

            if(!window.masterPegawai || !window.masterPegawai.length) {
                suggestions.innerHTML = '<div class="p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Database belum terbaca. Klik Muat Ulang.</div>';
                suggestions.classList.remove('hidden');
                return;
            }

            if(query.length < 1) {
                suggestions.innerHTML = '<div class="p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Ketik awal nama pegawai untuk menampilkan pilihan.</div>';
                suggestions.classList.remove('hidden');
                return;
            }

            const matches = getSortedLoginPegawai().filter(p => {
                const nameNorm = normalize(p.nama);
                const wordStart = String(p.nama || '').split(/\s+/).some(part => normalize(part).startsWith(query));
                return nameNorm.startsWith(query) || wordStart;
            }).slice(0, 8);

            if(!matches.length) {
                suggestions.innerHTML = '<div class="p-4 text-center text-[10px] font-black uppercase tracking-widest text-rose-400">Nama tidak ditemukan.</div>';
                suggestions.classList.remove('hidden');
                return;
            }

            suggestions.innerHTML = matches.map(p => `
                <button type="button" class="login-suggestion-item" onclick="window.setLoginSelectedName('${escapeHTML(p.nama).replaceAll("'", "\\'")}')">
                    <span class="text-xs font-black text-slate-800 uppercase">${escapeHTML(p.nama)}</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase">${escapeHTML(p.lab || '-')}${p.status ? ' • ' + escapeHTML(p.status) : ''}${p.peran && normalize(p.peran) !== 'pegawai' ? ' • ' + escapeHTML(p.peran) : ''}${p.cakupanUnit ? ' • Cakupan: ' + escapeHTML(p.cakupanUnit) : ''}</span>
                </button>
            `).join('');
            suggestions.classList.remove('hidden');
        };

        window.populateLoginDropdown = function() {
            const search = document.getElementById('login-user-search');
            const hidden = document.getElementById('login-user-select');
            const suggestions = document.getElementById('login-user-suggestions');
            if(!search) return;
            if(hidden) hidden.value = '';
            if (!getSortedLoginPegawai().length) {
                search.placeholder = 'Database belum terbaca, klik Muat Ulang';
                if(suggestions) suggestions.innerHTML = '<div class="p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Database belum terbaca.</div>';
                return;
            }
            search.placeholder = 'Ketik awal nama pegawai...';
        };

        // --- 🔔 LOGIK NOTIFIKASI PENGINGAT HARIAN BERDASARKAN HARI KERJA ---
        function dateKeyToLocalDate(dateKey) {
            const [y, m, d] = String(dateKey || '').split('-').map(Number);
            if(!y || !m || !d) return null;
            return new Date(y, m - 1, d);
        }

        function addOneDayKey(dateKey) {
            const d = dateKeyToLocalDate(dateKey);
            if(!d) return '';
            d.setDate(d.getDate() + 1);
            return d.toLocaleDateString('en-CA');
        }

        function isActiveHolidayItem(item) {
            if(!item) return false;
            const rawActive = item.aktif ?? item.active ?? item.status ?? 'true';
            const activeText = String(rawActive === '' || rawActive === null || rawActive === undefined ? 'true' : rawActive).toLowerCase();
            return !['false', '0', 'tidak', 'nonaktif', 'inactive'].includes(activeText);
        }

        function getHolidayInfoForDate(dateKey) {
            const d = dateKeyToLocalDate(dateKey);
            if(!d) return { isWeekend: false, isHoliday: false, isWorkingDay: false, label: '' };

            const day = d.getDay();
            const isWeekend = day === 0 || day === 6;
            const staticHoliday = Array.isArray(liburNasional) && liburNasional.includes(dateKey);
            const dynamicHoliday = (window.kalenderLiburData || []).find(item => {
                const itemDate = String(item.tanggal || item.date || item.Tanggal || '').slice(0, 10);
                return itemDate === dateKey && isActiveHolidayItem(item);
            });

            const isHoliday = staticHoliday || !!dynamicHoliday;
            const label = dynamicHoliday
                ? (dynamicHoliday.keterangan || dynamicHoliday.Keterangan || dynamicHoliday.jenis || dynamicHoliday.Jenis || 'Hari Libur')
                : (staticHoliday ? 'Libur Nasional' : '');

            return {
                isWeekend,
                isHoliday,
                isWorkingDay: !isWeekend && !isHoliday,
                label
            };
        }

        function isWorkingDayKey(dateKey) {
            return getHolidayInfoForDate(dateKey).isWorkingDay;
        }

        function countWorkingDaysAfterLastJournal(lastDateKey, todayKey) {
            if(!lastDateKey || !todayKey || lastDateKey >= todayKey) return 0;

            let cursor = addOneDayKey(lastDateKey);
            let count = 0;
            let guard = 0;

            while(cursor && cursor <= todayKey && guard < 900) {
                if(isWorkingDayKey(cursor)) count += 1;
                cursor = addOneDayKey(cursor);
                guard += 1;
            }

            return count;
        }

        function getCurrentUserJournalRows() {
            if(!window.currentUser || window.isAdmin) return [];
            return (window.arikaData || []).filter(d => {
                if(typeof personMatchesRow === 'function') return personMatchesRow(d, window.currentUser);
                return normalize(d.name) === normalize(window.currentUser.nama);
            });
        }

        function getJournalGapInfo() {
            const todayStr = getTodayKey();
            const todayHolidayInfo = getHolidayInfoForDate(todayStr);
            const userRows = getCurrentUserJournalRows().filter(d => d.date);
            const hasFilledToday = userRows.some(d => String(d.date || '').slice(0, 10) === todayStr);
            const dates = Array.from(new Set(userRows.map(d => String(d.date || '').slice(0, 10)).filter(Boolean))).sort();
            const lastDate = dates.length ? dates[dates.length - 1] : '';
            const missedWorkingDays = lastDate ? countWorkingDaysAfterLastJournal(lastDate, todayStr) : 0;

            return {
                todayStr,
                todayIsWorkingDay: todayHolidayInfo.isWorkingDay,
                todayHolidayInfo,
                hasFilledToday,
                dates,
                lastDate,
                missedWorkingDays
            };
        }

        // --- 🔊 VOICE REMINDER BERANDA PEGAWAI ---
        // Catatan: browser modern hanya mengizinkan audio/suara setelah ada interaksi pengguna.
        // Karena itu ARIKA menyediakan tombol "Aktifkan Suara". Setelah aktif, pengingat dapat dibacakan
        // saat ARIKA tetap terbuka meskipun pegawai sedang membuka tab lain dalam peramban yang sama.
        const ARIKA_REMINDER_SOUND_KEY = 'arika_reminder_sound_enabled_v1';
        const ARIKA_REMINDER_DESKTOP_KEY = 'arika_reminder_desktop_notification_enabled_v1';
        const ARIKA_REMINDER_SOUND_LOG_KEY = 'arika_reminder_sound_log_v1';
        let arikaAudioContext = null;
        let arikaReminderWatcherTimer = null;
        let arikaOriginalTitle = document.title || 'ARIKA';
        let arikaTitleFlashTimer = null;
        let arikaVoicesReadyPromise = null;
        const ARIKA_REMINDER_MP3_SRC = 'alarm_reminder.mp3';
        let arikaReminderMp3Audio = null;

        function getArikaSoundEnabled() {
            try { return localStorage.getItem(ARIKA_REMINDER_SOUND_KEY) === 'true'; } catch(e) { return false; }
        }

        function setArikaSoundEnabled(value) {
            try { localStorage.setItem(ARIKA_REMINDER_SOUND_KEY, value ? 'true' : 'false'); } catch(e) {}
        }

        function getArikaDesktopNotificationEnabled() {
            return false;
        }

        function setArikaDesktopNotificationEnabled(value) {
            try { localStorage.setItem(ARIKA_REMINDER_DESKTOP_KEY, 'false'); } catch(e) {}
        }

        function getArikaDesktopNotificationStatusText() {
            return 'Dinonaktifkan';
        }

        function setArikaReminderButtonTone(button, tone) {
            if(!button) return;
            button.classList.remove('reminder-sound-on', 'reminder-sound-off', 'reminder-sound-active', 'reminder-sound-muted', 'reminder-sound-danger');
            button.classList.add(tone || 'reminder-sound-muted');
        }

        function updateArikaReminderSoundPanel() {
            const panel = document.getElementById('reminder-sound-panel');
            const status = document.getElementById('reminder-sound-status');
            const desktopStatus = document.getElementById('reminder-desktop-status');
            const soundActive = !!(window.currentUser && !window.isAdmin && getArikaSoundEnabled());
            const desktopActive = false;

            if(panel) panel.classList.toggle('hidden', !window.currentUser || window.isAdmin);
            if(status) {
                status.classList.remove('active', 'blocked');
                if(!window.currentUser || window.isAdmin) status.textContent = 'Tidak tersedia';
                else if(soundActive) { status.textContent = 'Aktif'; status.classList.add('active'); }
                else status.textContent = 'Belum aktif';
            }
            if(desktopStatus) {
                desktopStatus.classList.remove('active', 'blocked');
                if(!window.currentUser || window.isAdmin) desktopStatus.textContent = 'Tidak tersedia';
                else {
                    const desktopText = getArikaDesktopNotificationStatusText();
                    desktopStatus.textContent = desktopText;
                    if(desktopActive) desktopStatus.classList.add('active');
                    if(desktopText.toLowerCase().indexOf('blokir') !== -1) desktopStatus.classList.add('blocked');
                }
            }

            const soundEnableBtn = document.getElementById('arika-sound-enable-btn');
            const soundDisableBtn = document.getElementById('arika-sound-disable-btn');
            const notifEnableBtn = document.getElementById('arika-notif-enable-btn');
            const notifDisableBtn = document.getElementById('arika-notif-disable-btn');

            // Warna tombol dibuat mengikuti status:
            // - Jika fitur belum aktif, tombol aktifkan berwarna dan tombol matikan abu-abu.
            // - Jika fitur sudah aktif, tombol aktifkan menjadi abu-abu dan tombol matikan menjadi berwarna.
            setArikaReminderButtonTone(soundEnableBtn, soundActive ? 'reminder-sound-muted' : 'reminder-sound-active');
            setArikaReminderButtonTone(soundDisableBtn, soundActive ? 'reminder-sound-danger' : 'reminder-sound-muted');

            const needsSoundAttention = !!(window.currentUser && !window.isAdmin && !soundActive);
            if(soundEnableBtn) {
                soundEnableBtn.disabled = soundActive;
                soundEnableBtn.textContent = soundActive ? '✅ Suara Aktif' : '🔔 Aktifkan Suara';
                soundEnableBtn.classList.toggle('arika-sound-attention', needsSoundAttention);
                soundEnableBtn.setAttribute('aria-label', soundActive ? 'Suara reminder ARIKA sudah aktif' : 'Aktifkan suara reminder ARIKA');
            }
            if(soundDisableBtn) soundDisableBtn.disabled = !soundActive;

            const compactToggle = document.getElementById('arika-reminder-compact-toggle');
            if(compactToggle) {
                compactToggle.classList.toggle('arika-sound-attention-panel', needsSoundAttention);
                const hint = compactToggle.querySelector('.title span');
                if(hint) hint.textContent = needsSoundAttention ? 'Suara belum aktif — ketuk lalu pilih Aktifkan Suara.' : 'Ketuk untuk mengatur suara dan Pusat Reminder.';
            }
        }

        function getArikaAudioContext() {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if(!AudioCtx) return null;
            if(!arikaAudioContext) arikaAudioContext = new AudioCtx();
            return arikaAudioContext;
        }

        async function resumeArikaAudioContext() {
            const ctx = getArikaAudioContext();
            if(!ctx) return false;
            try {
                if(ctx.state === 'suspended') await ctx.resume();
                return ctx.state === 'running';
            } catch(e) {
                return false;
            }
        }

        function playArikaTone(ctx, startAt, frequency, duration, options = {}) {
            // v181: nada alarm dibuat menyerupai lonceng yang lebih jernih.
            // Tetap memakai Web Audio murni agar aman untuk GitHub Pages tanpa file MP3 tambahan.
            const output = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            const compressor = ctx.createDynamicsCompressor();

            const master = Math.min(1.0, Math.max(0.18, Number(options.master || 0.86)));
            const peak = Math.min(0.98, Math.max(0.12, Number(options.peak || 0.78)));
            const bright = Number(options.filter || 7200);
            const bellDuration = Math.max(0.45, Number(duration || 1.15));

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(bright, startAt);
            filter.Q.setValueAtTime(0.55, startAt);

            compressor.threshold.setValueAtTime(-8, startAt);
            compressor.knee.setValueAtTime(18, startAt);
            compressor.ratio.setValueAtTime(4, startAt);
            compressor.attack.setValueAtTime(0.004, startAt);
            compressor.release.setValueAtTime(0.16, startAt);

            output.gain.setValueAtTime(master, startAt);
            filter.connect(output);
            output.connect(compressor);
            compressor.connect(ctx.destination);

            const partials = options.partials || [
                { ratio: 1.00, gain: 0.70, decay: 1.00 },
                { ratio: 2.01, gain: 0.34, decay: 0.82 },
                { ratio: 2.78, gain: 0.20, decay: 0.62 },
                { ratio: 4.05, gain: 0.12, decay: 0.45 },
                { ratio: 5.42, gain: 0.08, decay: 0.34 }
            ];

            partials.forEach((part, index) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const tonePeak = Math.max(0.0001, peak * part.gain);
                const attack = 0.010 + (index * 0.002);
                const decayEnd = startAt + Math.max(0.16, bellDuration * (part.decay || 0.8));

                osc.type = 'sine';
                osc.frequency.setValueAtTime(frequency * part.ratio, startAt);
                try { osc.detune.setValueAtTime((index - 2) * 1.5, startAt); } catch(e) {}

                gain.gain.setValueAtTime(0.0001, startAt);
                gain.gain.exponentialRampToValueAtTime(tonePeak, startAt + attack);
                gain.gain.exponentialRampToValueAtTime(0.0001, decayEnd);

                osc.connect(gain);
                gain.connect(filter);
                osc.start(startAt);
                osc.stop(startAt + bellDuration + 0.14);
            });
        }

        function getArikaReminderMp3Audio() {
            try {
                if(!arikaReminderMp3Audio) {
                    arikaReminderMp3Audio = new Audio(ARIKA_REMINDER_MP3_SRC);
                    arikaReminderMp3Audio.preload = 'auto';
                    arikaReminderMp3Audio.loop = false;
                    arikaReminderMp3Audio.volume = 1.0;
                }
                return arikaReminderMp3Audio;
            } catch(e) {
                return null;
            }
        }

        function prepareArikaReminderMp3Audio() {
            try {
                const audio = getArikaReminderMp3Audio();
                if(audio && typeof audio.load === 'function') audio.load();
                return !!audio;
            } catch(e) {
                return false;
            }
        }

        function waitArikaMs(ms) {
            return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))));
        }

        async function waitForArikaReminderMp3ToFinish(maxMs = 5200) {
            const audio = getArikaReminderMp3Audio();
            if(!audio) return false;
            return new Promise(resolve => {
                let settled = false;
                const finish = (value) => {
                    if(settled) return;
                    settled = true;
                    try { audio.removeEventListener('ended', onEnded); } catch(e) {}
                    try { audio.removeEventListener('error', onError); } catch(e) {}
                    try { clearTimeout(timer); } catch(e) {}
                    resolve(value);
                };
                const onEnded = () => finish(true);
                const onError = () => finish(false);
                const timer = setTimeout(() => finish(false), Math.max(1200, Number(maxMs || 5200)));
                try {
                    if(audio.ended || audio.paused || audio.currentTime >= Math.max(0.1, (audio.duration || 0) - 0.08)) {
                        finish(true);
                        return;
                    }
                    audio.addEventListener('ended', onEnded, { once: true });
                    audio.addEventListener('error', onError, { once: true });
                } catch(e) {
                    finish(false);
                }
            });
        }

        async function playArikaReminderMp3(kind = 'default') {
            if(!getArikaSoundEnabled()) return false;
            const audio = getArikaReminderMp3Audio();
            if(!audio) return false;
            try {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = kind === 'urgent' ? 1.0 : 0.98;
                await audio.play();
                try {
                    if(navigator.vibrate) navigator.vibrate(kind === 'urgent' ? [180, 80, 180, 80, 180] : [130, 70, 130]);
                } catch(e) {}
                return true;
            } catch(e) {
                return false;
            }
        }

        function playArikaBeepPattern(kind = 'default') {
            // v187: bel sintetis/non-MP3 dinonaktifkan. Alarm ARIKA hanya memakai alarm_reminder.mp3.
            return false;
        }

        function getArikaReminderTimingText() {
            return 'Alarm ARIKA memakai file MP3 custom alarm_reminder.mp3 sebagai suara utama. Setelah alarm selesai, narasi manusia dibacakan dengan volume maksimum browser dan tempo lebih jelas agar tidak tenggelam oleh alarm. Sistem mengecek reminder sekitar setiap 10 detik, termasuk dari data stabil lokal/cache, dan akan mencoba ulang bila suara belum sempat keluar pada tab background. Reminder yang sama tidak dibunyikan terus-menerus; rencana pribadi akan berulang sekitar 15 menit sekali selama belum diklik selesai, jurnal/catatan sekitar 180 menit sekali, pengumuman sekitar 120 menit sekali, dan agenda mendekati waktu mulai sekitar 15 menit sekali.';
        }

        function arikaSpeechSupported() {
            return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
        }

        function loadArikaVoices() {
            if(!arikaSpeechSupported()) return Promise.resolve([]);
            const synth = window.speechSynthesis;
            const voices = synth.getVoices();
            if(voices && voices.length) return Promise.resolve(voices);
            if(arikaVoicesReadyPromise) return arikaVoicesReadyPromise;
            arikaVoicesReadyPromise = new Promise(resolve => {
                let done = false;
                const finish = () => {
                    if(done) return;
                    done = true;
                    resolve(synth.getVoices() || []);
                };
                try { synth.onvoiceschanged = finish; } catch(e) {}
                setTimeout(finish, 1200);
            });
            return arikaVoicesReadyPromise;
        }

        function getArikaPreferredVoice() {
            if(!arikaSpeechSupported()) return null;
            const voices = window.speechSynthesis.getVoices() || [];
            if(!voices.length) return null;
            const lower = v => `${v.name || ''} ${v.lang || ''} ${v.voiceURI || ''}`.toLowerCase();

            // Penting: jangan fallback ke suara English/default, karena akan terdengar logat Inggris.
            // ARIKA hanya memilih voice Bahasa Indonesia. Jika tidak ada, fungsi ini mengembalikan null.
            const indonesianVoices = voices.filter(v => /(^|[-_])id($|[-_])|id-id|indonesia|indonesian|bahasa indonesia|bahasa_indonesia/.test(lower(v)));
            if(!indonesianVoices.length) return null;

            // v186: pilih suara Indonesia yang paling mendekati karakter wanita muda/presenter.
            // Nama voice berbeda-beda di tiap perangkat/browser, jadi dipilih dengan sistem skor.
            const scoreVoice = (voice) => {
                const text = lower(voice);
                let score = 0;

                // Cocokkan bahasa Indonesia lebih dulu.
                if(/id-id|id_id|indonesian|indonesia|bahasa indonesia|bahasa_indonesia/.test(text)) score += 45;
                if(/^id[-_]?id$/i.test(voice.lang || '')) score += 35;

                // Prioritas untuk voice wanita atau nama voice Indonesia yang umumnya lebih halus.
                if(/female|woman|wanita|perempuan|gadis|putri|citra|siti|arini|damayanti|indah|amelia|ayunda|kartika|ratih|maya|nisa|nina|diah/.test(text)) score += 80;

                // Voice cloud/modern biasanya lebih natural daripada voice legacy lokal.
                if(/google|microsoft|natural|online|neural|premium|enhanced/.test(text)) score += 24;
                if(voice.localService === false) score += 8;

                // Hindari suara yang jelas laki-laki bila tersedia alternatif wanita.
                if(/male|man|laki|pria|ardi|andika|dimas|bayu|budi|agus|joko/.test(text)) score -= 70;

                // Hindari voice lama/kompak jika ada pilihan lain.
                if(/legacy|compact|default|old/.test(text)) score -= 15;

                return score;
            };

            return indonesianVoices
                .slice()
                .sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || indonesianVoices[0] || null;
        }

        function hasArikaIndonesianVoice() {
            return !!getArikaPreferredVoice();
        }

        function getArikaVoiceDiagnosticText() {
            if(!arikaSpeechSupported()) return 'Browser belum mendukung pembacaan suara.';
            const voices = window.speechSynthesis.getVoices() || [];
            const voice = getArikaPreferredVoice();
            if(voice) return `Mode narasi wanita muda/presenter aktif memakai voice: ${voice.name || 'Voice Indonesia'}. Kualitas suara tetap mengikuti voice yang tersedia di browser/perangkat ini.`;
            if(!voices.length) return 'Daftar suara belum terbaca. Klik Tes Suara kembali beberapa detik lagi.';
            return 'Suara Bahasa Indonesia tidak ditemukan di browser/perangkat ini. ARIKA akan tetap memakai alarm MP3 custom sebagai pengingat utama. Jika ingin narasi wanita yang lebih natural, tambahkan voice Bahasa Indonesia wanita/natural di pengaturan Windows/Edge/Chrome.';
        }

        function sanitizeArikaSpeechText(text) {
            return String(text || '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 260);
        }

        async function speakArikaReminderText(text, kind = 'default') {
            if(!getArikaSoundEnabled() || !arikaSpeechSupported()) return false;
            const cleanText = sanitizeArikaSpeechText(text);
            if(!cleanText) return false;
            try {
                await loadArikaVoices();
                const voice = getArikaPreferredVoice();
                if(!voice) {
                    // Hindari logat English/default. Bila voice Indonesia tidak ada, cukup pakai alarm MP3.
                    return false;
                }

                const synth = window.speechSynthesis;
                try { synth.cancel(); } catch(e) {}

                // v188: volume SpeechSynthesis secara teknis sudah maksimum di 1.0.
                // Agar terdengar lebih jelas, narasi dibuat sedikit lebih pelan, artikulatif,
                // dan diputar setelah alarm MP3 selesai, bukan bersamaan/tertutup alarm.
                const utterance = new SpeechSynthesisUtterance(cleanText);
                utterance.lang = voice.lang || 'id-ID';
                utterance.voice = voice;
                utterance.volume = 1.0;
                utterance.rate = kind === 'urgent' ? 0.90 : 0.94;
                utterance.pitch = kind === 'urgent' ? 1.06 : 1.10;

                synth.speak(utterance);

                // Chrome/Edge kadang baru benar-benar memulai speech setelah resume kecil.
                setTimeout(() => {
                    try { if(!synth.speaking && !synth.pending) synth.speak(utterance); } catch(e) {}
                }, 180);

                return true;
            } catch(e) {
                return false;
            }
        }

        function getArikaReminderShortName_(rawName) {
            try {
                let text = String(rawName || '')
                    .replace(/[•|].*$/g, ' ')
                    .replace(/\([^)]*\)/g, ' ')
                    .replace(/[,;]+/g, ' ')
                    .replace(/\b(S\.?\s*Farm\.?|Apt\.?|M\.?\s*Farm\.?|S\.?\s*Si\.?|S\.?\s*T\.?|S\.?\s*Kom\.?|M\.?\s*Si\.?|M\.?\s*Kes\.?|M\.?\s*Pd\.?|Dr\.?|dr\.?|Dra\.?|Drs\.?|Prof\.?|Ir\.?|A\.?Md\.?|Amd\.?)\b/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                const ignored = ['apt', 'dr', 'dra', 'drs', 'prof', 'ir', 'bapak', 'ibu', 'sdr', 'sdri', 'staf', 'fungsi', 'pengujian', 'verifikator', 'ketua', 'tim'];
                const token = text.split(/\s+/).find(part => {
                    const clean = String(part || '').replace(/[^A-Za-zÀ-ÿ]/g, '').toLowerCase();
                    return clean && clean.length > 1 && ignored.indexOf(clean) === -1;
                });
                if(!token) return text.split(/\s+/)[0] || '';
                const cleaned = String(token || '').replace(/[^A-Za-zÀ-ÿ'’-]/g, '');
                if(!cleaned) return '';
                return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
            } catch(e) {
                return String(rawName || '').split(/\s+/)[0] || '';
            }
        }

        function getArikaReminderUserName() {
            try {
                const user = window.currentUser || window.activeUser || {};
                const rawName = user.nama || user.name || user.Pelaksana || user['Nama'] || '';
                return getArikaReminderShortName_(rawName);
            } catch(e) {
                return '';
            }
        }

        function personalizeArikaReminderSpeech(text) {
            const base = sanitizeArikaSpeechText(text || 'Ada pengingat ARIKA yang perlu diperhatikan.');
            const name = getArikaReminderUserName();
            let message = base
                .replace(/^halo[,.!\s]*/i, '')
                .replace(/^hai[,.!\s]*/i, '')
                .trim();
            if(!message) message = 'Ada pengingat ARIKA yang perlu diperhatikan.';
            message = message.charAt(0).toUpperCase() + message.slice(1);
            return name ? `Halo, ${name}. ${message}` : `Halo. ${message}`;
        }

        function getArikaReminderSpeech(event) {
            if(!event) return personalizeArikaReminderSpeech('Ada pengingat ARIKA yang perlu diperhatikan.');
            return personalizeArikaReminderSpeech(event.speech || event.body || event.title || 'Ada pengingat ARIKA yang perlu diperhatikan.');
        }

        function flashArikaTitle(title) {
            try {
                clearInterval(arikaTitleFlashTimer);
                let count = 0;
                const alertTitle = `🔔 ${title || 'Pengingat ARIKA'}`;
                arikaTitleFlashTimer = setInterval(() => {
                    document.title = (count % 2 === 0) ? alertTitle : arikaOriginalTitle;
                    count += 1;
                    if(count > 8) {
                        clearInterval(arikaTitleFlashTimer);
                        document.title = arikaOriginalTitle;
                    }
                }, 850);
            } catch(e) {}
        }

        function showArikaBrowserNotification(title, body, options = {}) {
            // v161: notifikasi pop-up browser dinonaktifkan karena izin browser/Windows tidak stabil.
            // Pengingat difokuskan ke Pusat Reminder, banner visual Beranda, judul tab berkedip, dan suara alarm.
            return false;
        }

        function getArikaSoundLog() {
            try { return JSON.parse(localStorage.getItem(ARIKA_REMINDER_SOUND_LOG_KEY) || '{}') || {}; } catch(e) { return {}; }
        }

        function setArikaSoundLog(log) {
            try { localStorage.setItem(ARIKA_REMINDER_SOUND_LOG_KEY, JSON.stringify(log || {})); } catch(e) {}
        }

        function shouldPlayArikaReminderSound(key, repeatMinutes) {
            // v180: hanya CEK apakah reminder sudah boleh dibunyikan.
            // Jangan menulis log di sini, karena pada tab background audio bisa gagal/resume tertunda.
            // Log baru ditulis setelah triggerArikaReminderSoundNow benar-benar berhasil mengeluarkan bunyi/suara.
            if(!key) return false;
            const log = getArikaSoundLog();
            const now = Date.now();
            const last = Number(log[key] || 0);
            const minMs = Math.max(5, Number(repeatMinutes || 120)) * 60 * 1000;
            if(last && (now - last) < minMs) return false;
            return true;
        }

        function markArikaReminderSoundPlayed(key) {
            if(!key) return;
            const log = getArikaSoundLog();
            const now = Date.now();
            log[key] = now;

            // Bersihkan log lama agar localStorage tidak membesar.
            Object.keys(log).forEach(k => {
                if(now - Number(log[k] || 0) > 7 * 24 * 60 * 60 * 1000) delete log[k];
            });
            setArikaSoundLog(log);
        }

        function reminderUserKey() {
            const u = window.currentUser || {};
            return normalize(u.nip || u.nama || 'pegawai');
        }

        function addReminderEvent(events, event) {
            if(!event || !event.key) return;
            events.push({
                priority: Number(event.priority || 5),
                kind: event.kind || 'default',
                key: event.key,
                title: event.title || 'Pengingat ARIKA',
                body: event.body || 'Ada pengingat yang perlu diperhatikan.',
                speech: event.speech || event.body || 'Ada pengingat ARIKA yang perlu diperhatikan.',
                repeatMinutes: Number(event.repeatMinutes || 120)
            });
        }

        function collectBerandaReminderEvents() {
            const events = [];
            if(!window.currentUser || window.isAdmin) return events;
            const userKey = reminderUserKey();
            const today = getTodayKey();

            try {
                const info = getJournalGapInfo();
                if(info.todayIsWorkingDay && !info.hasFilledToday) {
                    addReminderEvent(events, {
                        priority: 4,
                        kind: 'default',
                        key: `jurnal-harian-${userKey}-${info.todayStr}`,
                        title: 'Reminder Isi Jurnal',
                        body: 'Anda belum mengisi jurnal kegiatan hari ini.',
                        speech: 'Halo, jangan lupa mengisi jurnal kegiatan hari ini di ARIKA.',
                        repeatMinutes: 180
                    });
                }
                if(info.todayIsWorkingDay && !info.hasFilledToday && Number(info.missedWorkingDays) > 2) {
                    addReminderEvent(events, {
                        priority: 1,
                        kind: 'urgent',
                        key: `jurnal-terlewat-${userKey}-${info.todayStr}-${info.missedWorkingDays}`,
                        title: 'Jurnal Terlewat',
                        body: `Anda sudah ${info.missedWorkingDays} hari kerja belum mengisi jurnal kegiatan.`,
                        speech: `Perhatian. Anda sudah ${info.missedWorkingDays} hari kerja belum mengisi jurnal kegiatan. Silakan lengkapi jurnal ARIKA.`,
                        repeatMinutes: 120
                    });
                }
            } catch(e) {}

            try {
                const reviewedRows = typeof getMyReviewedJurnalRowsForAlert === 'function' ? getMyReviewedJurnalRowsForAlert() : [];
                const pendingRows = reviewedRows.filter(isJurnalReviewNeedsFollowUp);
                if(pendingRows.length) {
                    const latest = pendingRows[0];
                    addReminderEvent(events, {
                        priority: 2,
                        kind: 'review',
                        key: `catatan-atasan-${userKey}-${latest.id || latest.date || today}-${pendingRows.length}`,
                        title: 'Catatan Atasan',
                        body: `${pendingRows.length} catatan atasan perlu ditindaklanjuti.`,
                        speech: `Halo, ada ${pendingRows.length} catatan atasan pada jurnal kegiatan yang perlu ditindaklanjuti.`,
                        repeatMinutes: 180
                    });
                }
            } catch(e) {}

            try {
                // v182: ambil rencana dari sumber stabil, bukan hanya window.rencanaData.
                // Saat tab berpindah/background, window.rencanaData kadang belum terbarui penuh,
                // sementara data baru sudah tersimpan di localStorage/cache. Jika hanya membaca window.rencanaData,
                // alarm rencana pada menit yang sama bisa terlewat.
                const rencanaSource = (typeof getStableRencanaData === 'function')
                    ? getStableRencanaData(window.rencanaData || [])
                    : (window.rencanaData || []);
                const rencanaList = dedupeRencanaList((rencanaSource || [])
                    .filter(isCurrentUserRencana)
                    .filter(isRencanaDalamRentangMinggu)
                    .filter(item => !isRencanaSelesai(item))
                    .filter(item => isRencanaHariIni(item) || isRencanaTerlewat(item)))
                    .sort((a, b) => {
                        const ad = getRencanaDueMinutes(a);
                        const bd = getRencanaDueMinutes(b);
                        if(ad === null && bd === null) return 0;
                        if(ad === null) return 1;
                        if(bd === null) return -1;
                        return ad - bd;
                    });
                if(rencanaList.length) {
                    const dueTodayList = rencanaList.filter(isRencanaHariIni);
                    const overdueList = rencanaList.filter(isRencanaTerlewat);
                    const overdueCount = overdueList.length;
                    const todayCount = dueTodayList.length;
                    const nearestDue = dueTodayList[0] || overdueList[0] || rencanaList[0];
                    const jamText = nearestDue && getRencanaJamReminder(nearestDue) ? ` pukul ${getRencanaJamReminder(nearestDue)}` : '';
                    const planTitle = nearestDue && nearestDue.judul ? `: ${nearestDue.judul}` : '';
                    const dueKeyBase = nearestDue ? `${nearestDue.id || getRencanaKey(nearestDue)}-${nearestDue.tanggal || today}-${getRencanaJamReminder(nearestDue)}` : today;
                    addReminderEvent(events, {
                        // Rencana yang sudah masuk jamnya harus menang dari reminder jurnal biasa,
                        // supaya alarm pada jam pilihan user tidak tertunda oleh event lain.
                        priority: 0,
                        kind: 'rencana',
                        key: `rencana-pribadi-${userKey}-${todayCount ? 'due' : 'overdue'}-${dueKeyBase}`,
                        title: overdueCount && !todayCount ? 'Reminder Pribadi Terlewat' : 'Reminder Pribadi Sekarang',
                        body: overdueCount && !todayCount ? `${overdueCount} rencana pribadi melewati target.` : `${todayCount || 1} rencana pribadi sudah memasuki jam reminder${jamText}${planTitle}.`,
                        speech: overdueCount && !todayCount ? `Halo, ada ${overdueCount} reminder pribadi yang sudah melewati target.` : `Halo, reminder pribadi${planTitle} sudah memasuki jam pengingat${jamText}.`,
                        // v185: Rencana Saya berbunyi ulang sekitar 15 menit sekali selama belum diklik selesai.
                        // Begitu status berubah menjadi selesai, event ini hilang karena filter isRencanaSelesai().
                        repeatMinutes: 15
                    });
                }
            } catch(e) {}

            try {
                const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); })();
                const pengumumanList = (window.pengumumanData || [])
                    .filter(isPengumumanUntukUser)
                    .filter(isPengumumanDalamRentangMinggu)
                    .filter(item => {
                        const start = item.mulai || today;
                        const end = item.selesai || start;
                        const todayActive = start <= today && end >= today;
                        const tomorrowActive = !todayActive && start <= tomorrow && end >= tomorrow;
                        return todayActive || tomorrowActive;
                    });
                if(pengumumanList.length) {
                    const activeToday = pengumumanList.filter(item => (item.mulai || today) <= today && (item.selesai || item.mulai || today) >= today).length;
                    addReminderEvent(events, {
                        priority: activeToday ? 3 : 5,
                        kind: 'pengumuman',
                        key: `pengumuman-${userKey}-${today}-${pengumumanList.map(x => x.id || x.judul).slice(0, 4).join('|')}`,
                        title: activeToday ? 'Pengumuman Aktif Hari Ini' : 'Pengumuman Besok',
                        body: activeToday ? `${activeToday} pengumuman aktif hari ini.` : `${pengumumanList.length} pengumuman perlu disiapkan.`,
                        speech: activeToday ? `Halo, ada ${activeToday} pengumuman aktif hari ini di beranda ARIKA.` : `Halo, ada pengumuman untuk besok yang perlu diperhatikan.`,
                        repeatMinutes: 120
                    });
                }
            } catch(e) {}

            try {
                const maxDate = addDaysToKey(today, 14);
                const agendaList = (window.agendaData || [])
                    .filter(a => isAgendaTampilDiBeranda(a, maxDate))
                    .filter(isAgendaUntukUser)
                    .map(a => ({ item: a, info: getAgendaReminderInfo(a) }))
                    .filter(x => ['mulai', '24jam', 'hari_ini'].includes(x.info.status));
                if(agendaList.length) {
                    const urgent = agendaList.find(x => x.info.status === 'mulai') || agendaList[0];
                    const agendaTitle = urgent.item.judul || 'Agenda kegiatan';
                    const timeText = urgent.item.waktuMulai ? ` pukul ${urgent.item.waktuMulai} WIT` : '';
                    addReminderEvent(events, {
                        priority: urgent.info.status === 'mulai' ? 1 : 3,
                        kind: 'agenda',
                        key: `agenda-${userKey}-${today}-${urgent.item.id || urgent.item.judul}-${urgent.info.status}`,
                        title: urgent.info.status === 'mulai' ? 'Agenda Mulai Sekarang' : 'Agenda Perlu Disiapkan',
                        body: `${agendaTitle}${timeText}`,
                        speech: urgent.info.status === 'mulai' ? `Perhatian. Agenda ${agendaTitle}${timeText} akan segera dimulai.` : `Halo, agenda ${agendaTitle}${timeText} perlu disiapkan.`,
                        repeatMinutes: urgent.info.status === 'mulai' ? 15 : 60
                    });
                }
            } catch(e) {}

            return events.sort((a, b) => a.priority - b.priority);
        }

        async function triggerArikaReminderSoundNow(event) {
            if(!event || (!getArikaSoundEnabled() && !getArikaDesktopNotificationEnabled())) return false;

            let playedMp3 = false;
            let spoke = false;

            if(getArikaSoundEnabled()) {
                // v188: alarm MP3 diputar lebih dulu sampai selesai/nyaris selesai.
                // Narasi manusia baru dibacakan setelahnya agar tidak tenggelam oleh alarm MP3.
                playedMp3 = await playArikaReminderMp3(event.kind);
                if(playedMp3) {
                    await waitForArikaReminderMp3ToFinish(event.kind === 'urgent' ? 6500 : 5600);
                    await waitArikaMs(350);
                }
                spoke = await speakArikaReminderText(getArikaReminderSpeech(event), event.kind);
            }

            const notified = showArikaBrowserNotification(event.title, event.body, {
                tag: `arika-reminder-${event.kind || 'umum'}`,
                targetView: 'beranda'
            });

            if(playedMp3 || spoke || notified) {
                flashArikaTitle(event.title);
            } else {
                updateArikaReminderSoundPanel();
            }
            return playedMp3 || spoke || notified;
        }

        window.checkBerandaReminderSound = async function(options = {}) {
            if(!window.currentUser || window.isAdmin || (!getArikaSoundEnabled() && !getArikaDesktopNotificationEnabled())) return;
            const events = collectBerandaReminderEvents();
            if(!events.length) return;
            let selected = null;
            if(options && options.forceRencana) {
                selected = events.find(ev => ev.kind === 'rencana') || null;
                if(selected) {
                    const log = getArikaSoundLog();
                    log[selected.key] = 0;
                    setArikaSoundLog(log);
                }
            }
            if(!selected) selected = events.find(ev => shouldPlayArikaReminderSound(ev.key, ev.repeatMinutes));
            if(!selected) return;
            const played = await triggerArikaReminderSoundNow(selected);
            if(played) {
                markArikaReminderSoundPlayed(selected.key);
            } else if(options && options.forceRencana) {
                // Jika baru menyimpan rencana tetapi audio belum sempat keluar, jangan dikunci jeda 15 menit.
                // Timer berikutnya akan mencoba lagi selama tab ARIKA tetap terbuka.
                try { console.warn('Reminder ARIKA belum berhasil mengeluarkan suara, akan dicoba ulang.', selected); } catch(e) {}
            }
        };

        window.enableArikaReminderSound = async function(showMessage = true) {
            setArikaSoundEnabled(true);
            prepareArikaReminderMp3Audio();
            const ok = await resumeArikaAudioContext();
            await loadArikaVoices();
            updateArikaReminderSoundPanel();
            if(showMessage) {
                const playedMp3 = await playArikaReminderMp3('default');
                if(playedMp3) {
                    await waitForArikaReminderMp3ToFinish(5600);
                    await waitArikaMs(350);
                }
                const voiceText = getArikaReminderSpeech({ speech: 'Suara pengingat ARIKA sudah aktif. Alarm MP3 akan berbunyi lebih dulu, lalu narasi manusia dibacakan setelahnya agar terdengar lebih jelas.' });
                const spoke = await speakArikaReminderText(voiceText, 'default');
                if(playedMp3 || spoke) {
                    window.showCustomAlert('Suara pengingat ARIKA sudah aktif. Alarm utama memakai file MP3 custom. ' + getArikaVoiceDiagnosticText() + ' ' + getArikaReminderTimingText());
                } else {
                    window.showCustomAlert('Suara pengingat disimpan aktif, tetapi browser belum mengizinkan audio/suara. Klik tombol Tes Suara atau Aktifkan Suara sekali lagi.');
                }
            }
            setTimeout(() => window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'enable' }), 1200);
        };

        window.disableArikaReminderSound = function() {
            setArikaSoundEnabled(false);
            try { if(window.speechSynthesis) window.speechSynthesis.cancel(); } catch(e) {}
            try { if(arikaReminderMp3Audio) { arikaReminderMp3Audio.pause(); arikaReminderMp3Audio.currentTime = 0; } } catch(e) {}
            updateArikaReminderSoundPanel();
            window.showCustomAlert('Suara pengingat ARIKA dimatikan. Reminder visual di Beranda tetap muncul seperti biasa.');
        };

        window.testArikaReminderSound = async function() {
            setArikaSoundEnabled(true);
            prepareArikaReminderMp3Audio();
            const ok = await resumeArikaAudioContext();
            await loadArikaVoices();
            updateArikaReminderSoundPanel();
            const playedMp3 = await playArikaReminderMp3('urgent');
            if(playedMp3) {
                await waitForArikaReminderMp3ToFinish(6500);
                await waitArikaMs(350);
            }
            const spoke = await speakArikaReminderText(getArikaReminderSpeech({ speech: 'Ini tes suara pengingat ARIKA. Alarm utama memakai file MP3 custom. Setelah alarm selesai, narasi manusia dibacakan dengan volume maksimum browser dan tempo lebih jelas. Jika narasi masih kecil, penyebabnya biasanya volume voice bawaan perangkat atau mixer sistem.' }), 'urgent');
            flashArikaTitle('Tes Pengingat ARIKA');
            if(playedMp3 || spoke) {
                window.showCustomAlert('Tes suara berhasil. Alarm MP3 custom sudah dicoba. ' + getArikaVoiceDiagnosticText() + ' ' + getArikaReminderTimingText());
            } else {
                window.showCustomAlert(getArikaVoiceDiagnosticText() + ' Alarm MP3 belum terdengar. Pastikan file alarm_reminder.mp3 berada satu folder dengan index.html, tab tidak di-mute, dan volume perangkat aktif. ' + getArikaReminderTimingText());
            }
        };

        async function requestArikaDesktopNotificationPermission() {
            setArikaDesktopNotificationEnabled(false);
            updateArikaReminderSoundPanel();
            return 'disabled';
        }

        window.enableArikaDesktopNotification = async function(showMessage = true) {
            setArikaDesktopNotificationEnabled(false);
            updateArikaReminderSoundPanel();
            if(showMessage) {
                window.showCustomAlert('Fitur notifikasi pop-up browser sudah dinonaktifkan pada ARIKA. Pengingat kini difokuskan melalui Pusat Reminder, banner visual Beranda, dan suara alarm agar tidak bergantung pada izin browser.');
            }
            return false;
        };

        window.testArikaDesktopNotification = async function() {
            setArikaDesktopNotificationEnabled(false);
            updateArikaReminderSoundPanel();
            window.showCustomAlert('Tes notifikasi pop-up browser dinonaktifkan. Silakan gunakan Tes Suara dan Pusat Reminder untuk mengecek pengingat ARIKA.');
            return false;
        };

        window.disableArikaDesktopNotification = function() {
            setArikaDesktopNotificationEnabled(false);
            updateArikaReminderSoundPanel();
            window.showCustomAlert('Notifikasi pop-up browser ARIKA sudah dinonaktifkan. Suara pengingat dan reminder visual tetap berjalan.');
        };

        window.startArikaReminderSoundWatcher = function() {
            updateArikaReminderSoundPanel();
            if(arikaReminderWatcherTimer) clearInterval(arikaReminderWatcherTimer);
            if(!window.currentUser || window.isAdmin) return;

            const tickReminderWatcher = (source) => {
                try {
                    // v182: segarkan rencana dari data stabil sebelum cek suara.
                    // Ini penting untuk rencana yang baru dibuat dan user langsung pindah tab.
                    if(typeof getStableRencanaData === 'function') {
                        window.rencanaData = getStableRencanaData(window.rencanaData || []);
                    }
                } catch(e) {}
                try {
                    const beranda = document.getElementById('view-beranda');
                    if(beranda && !beranda.classList.contains('hidden')) {
                        window.renderRencanaPribadi && window.renderRencanaPribadi({ silent: true });
                    }
                } catch(e) {}
                try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: source || (document.hidden ? 'timer-hidden' : 'timer') }); } catch(e) {}
            };

            tickReminderWatcher('watcher-start');
            arikaReminderWatcherTimer = setInterval(() => tickReminderWatcher(document.hidden ? 'timer-hidden' : 'timer'), 10000);
        };

        document.addEventListener('visibilitychange', () => {
            if(document.hidden) {
                try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'hidden' }); } catch(e) {}
            } else {
                try { document.title = arikaOriginalTitle; clearInterval(arikaTitleFlashTimer); } catch(e) {}
                // v180: saat user kembali ke tab ARIKA, langsung cek ulang agar reminder yang sempat tertunda tidak hilang.
                try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'visible' }); } catch(e) {}
            }
        });

        window.addEventListener('focus', () => {
            try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'focus' }); } catch(e) {}
        });
        window.addEventListener('pageshow', () => {
            try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'pageshow' }); } catch(e) {}
        });

        function triggerDailyReminder() {
            if(!window.currentUser || window.isAdmin) return;

            const info = getJournalGapInfo();
            const banner = document.getElementById('reminder-banner');
            const gapBanner = document.getElementById('journal-gap-alert');
            const gapText = document.getElementById('journal-gap-alert-text');

            // Reminder harian hanya muncul pada hari kerja.
            if (banner) {
                if (info.todayIsWorkingDay && !info.hasFilledToday) banner.classList.remove('hidden');
                else banner.classList.add('hidden');
            }

            // Alert panjang dihitung berdasarkan hari kerja saja.
            // Sabtu, Minggu, libur nasional, dan tanggal pada sheet KalenderLibur tidak dihitung.
            const isLongGap = info.todayIsWorkingDay && !info.hasFilledToday && Number(info.missedWorkingDays) > 2;
            if(gapBanner) {
                if(isLongGap) {
                    const lastText = info.lastDate ? formatHariTanggal(info.lastDate) : 'belum ada riwayat jurnal';
                    if(gapText) {
                        gapText.innerText = `Jurnal terakhir tercatat pada ${lastText}. Sudah ${info.missedWorkingDays} hari kerja terlewat sejak jurnal terakhir. Sabtu, Minggu, dan hari libur tidak dihitung.`;
                    }
                    gapBanner.classList.remove('hidden');
                } else {
                    gapBanner.classList.add('hidden');
                }
            }

            // Pop-up alert hanya sekali per hari per pegawai agar tidak mengganggu.
            if(isLongGap) {
                const key = `arika_gap_alert_kerja_${normalize(window.currentUser.nip || window.currentUser.nama)}_${info.todayStr}`;
                try {
                    if(sessionStorage.getItem(key) !== 'shown') {
                        sessionStorage.setItem(key, 'shown');
                        window.showCustomAlert(`Pengingat ARIKA: Anda sudah ${info.missedWorkingDays} hari kerja belum mengisi jurnal kegiatan. Sabtu, Minggu, dan hari libur tidak dihitung.`);
                    }
                } catch(e) {}
            }
            try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'daily-reminder' }); } catch(e) {}
        }

        window.handleUserLogin = async function(e) {
            e.preventDefault();
            try { if(getArikaSoundEnabled && getArikaSoundEnabled()) window.enableArikaReminderSound(false); } catch(e) {}
            const selectEl = document.getElementById('login-user-select');
            const searchEl = document.getElementById('login-user-search');
            const nipEl = document.getElementById('login-user-nip');
            const name = (selectEl?.value || searchEl?.value || '').trim();
            const nipInput = nipEl ? nipEl.value.trim() : '';

            if (!window.masterPegawai || window.masterPegawai.length === 0) {
                window.showCustomAlert('Database pegawai belum terbaca. Klik "Muat Ulang" lalu coba login kembali.');
                window.fetchCloudData().catch(() => null);
                return;
            }

            const p = window.masterPegawai.find(x => normalize(x.nama) === normalize(name));

            if (!(p && normalize(p.nip) === normalize(nipInput))) {
                window.showCustomAlert("NIP atau Nama salah. Pastikan nama dipilih dari daftar dan NIP diketik tanpa spasi.");
                return;
            }

            window.showLoader(true, "Masuk Portal...");

            try {
                await createSession(p, false);
                loginSetup(p, false);

                // Catatan login dikirim di belakang layar. Jika gagal, login tetap berhasil.
                setTimeout(() => {
                    try {
                        fetch(SCRIPT_URL, {
                            method: 'POST',
                            mode: 'no-cors',
                            body: JSON.stringify({
                                action: 'log_login',
                                payload: { nama: p.nama, nip: p.nip, status: p.status, userAgent: navigator.userAgent }
                            })
                        }).catch(() => null);
                    } catch(e) {}
                }, 0);
            } catch (err) {
                console.error('Gagal membuka halaman pegawai:', err);
                window.showCustomAlert('Login berhasil, tetapi halaman pegawai gagal dibuka. Cek Console browser untuk detail error.');
            } finally {
                window.showLoader(false);
            }
        };

        // --- NORMALISASI INPUT LOGIN ADMIN (Mengatasi Caps Lock & Spasi Otomatis) ---
        window.handleAdminLogin = async function(e) {
            e.preventDefault();
            const userInput = document.getElementById('admin-user');
            const passInput = document.getElementById('admin-pass');
            const userVal = userInput ? userInput.value.toLowerCase().trim() : '';
            const passVal = passInput ? passInput.value.trim() : '';

            if(userVal === 'admin' && passVal === 'admin123') {
                window.showLoader(true, "Masuk Admin...");
                try {
                    const adminProfile = { nama: 'Administrator', nip: '-', status: 'Admin', lab: 'Administrator' };
                    await createSession(adminProfile, true);
                    try {
                        loginSetup(adminProfile, true);
                    } catch (setupErr) {
                        console.error('Detail error saat membuka panel admin:', setupErr);
                        // Fallback aman supaya admin tetap masuk walaupun ada elemen navigasi yang bermasalah.
                        window.currentUser = adminProfile;
                        window.isAdmin = true;
                        const mainNav = document.getElementById('main-nav');
                        if (mainNav) mainNav.classList.remove('hidden');
                        document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                        const adminView = document.getElementById('view-admin');
                        if (adminView) adminView.classList.remove('hidden');
                        if (typeof window.renderAdminDashboard === 'function') window.renderAdminDashboard();
                    }
                } catch(err) {
                    console.error('Gagal membuka panel admin:', err);
                    window.showCustomAlert('Login admin berhasil, tetapi panel admin gagal dibuka. Cek Console browser untuk detail error.');
                } finally {
                    window.showLoader(false);
                }
            } else {
                window.showCustomAlert('Username atau PIN Administrator salah!');
            }
        };

        window.toggleLemburFields = () => {
            const check = document.getElementById('in-is-lembur');
            const field = document.getElementById('lembur-fields');
            if(check && field) field.classList.toggle('hidden', !check.checked);
        };

        // --- FITUR SMART DAY DETECTION (Libur & Weekend) ---
        window.checkHariLibur = function() {
            const dateInput = document.getElementById('in-date').value;
            if (!dateInput) return;
            
            const d = new Date(dateInput);
            const day = d.getDay(); 
            const isWeekend = (day === 0 || day === 6);
            const isHoliday = liburNasional.includes(dateInput);
            
            const warningEl = document.getElementById('holiday-warning');
            const lemburCheck = document.getElementById('in-is-lembur');
            
            if (isWeekend || isHoliday) {
                warningEl.classList.remove('hidden');
                if (isWeekend) {
                    warningEl.innerText = "⚠️ Akhir Pekan Terdeteksi: Otomatis dihitung Lembur";
                } else {
                    warningEl.innerText = "⚠️ Libur Nasional Terdeteksi: Otomatis dihitung Lembur";
                }
                lemburCheck.checked = true;
                window.toggleLemburFields();
            } else {
                warningEl.classList.add('hidden');
            }
        };

        window.hapusJurnal = async function(date, desc, id = '') {
            window.showCustomConfirm(`Hapus jurnal kegiatan ini?\n\n"${desc}"`, async () => {
                const deleteTarget = { id: id, name: window.currentUser?.nama || '', date: date, desc: desc };
                markJurnalAsLocallyDeleted(deleteTarget);

                // v177: hapus optimistis dari tampilan terlebih dahulu agar user tidak menunggu respons Apps Script.
                // Apps Script tetap dipanggil di background untuk menghapus data di Google Sheet.
                window.arikaData = (window.arikaData || []).filter(d => !jurnalMatchesDeleteTarget(d, deleteTarget));
                filtered = (filtered || []).filter(d => !jurnalMatchesDeleteTarget(d, deleteTarget));

                try { saveLocalCoreCache(); } catch(_) {}
                try { renderCurrentDataState({ keepPage: true }); } catch(_) {}
                try { window.runFilter({ keepPage: true }); } catch(_) {}
                try { window.renderLemburTable && window.renderLemburTable(); } catch(_) {}
                try { window.renderVisualCalendar && window.renderVisualCalendar(); } catch(_) {}
                try { window.renderDashboardPegawai && window.renderDashboardPegawai({ fromDataRefresh: true }); } catch(_) {}
                try { updateSyncStatus('Catatan dihapus dari tampilan, sinkronisasi berjalan...', 'info'); } catch(_) {}

                postToScript('delete_jurnal', { id: id, name: window.currentUser?.nama || '', date: date, desc: desc })
                    .then(() => {
                        try { updateSyncStatus('Catatan jurnal berhasil dihapus', 'ok'); } catch(_) {}
                        setTimeout(() => window.fetchLiveJurnalFromSheet && window.fetchLiveJurnalFromSheet({ silent: true, timeoutMs: 12000 }), 700);
                    })
                    .catch(err => {
                        console.warn('Hapus jurnal dikirim tetapi respons Apps Script terlambat/gagal:', err);
                        try { updateSyncStatus('Tampilan sudah diperbarui, sinkron hapus dicek ulang...', 'warn'); } catch(_) {}
                        setTimeout(() => window.fetchLiveJurnalFromSheet && window.fetchLiveJurnalFromSheet({ silent: true, timeoutMs: 12000 }), 2500);
                    });
            });
        };

        window.renderLemburTable = function() {
            const body = document.getElementById('lembur-body');
            const filt = document.getElementById('filt-lembur-bulan').value;
            if(!body) return;
            body.innerHTML = '';
            const targetName = normalize(window.currentUser.nama);
            const data = window.arikaData.filter(d => d.isLembur && normalize(d.name) === targetName && (!filt || d.date.startsWith(filt)));
            if(data.length === 0) { body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400 italic text-[9px] uppercase font-black">Kosong</td></tr>'; return; }
            data.forEach(d => {
                const s = (d.start||"00:00").split(':'), e = (d.end||"00:00").split(':');
                const diff = (parseInt(e[0]||0)*60 + parseInt(e[1]||0)) - (parseInt(s[0]||0)*60 + parseInt(s[1]||0));
                const durStr = diff/60 >= 2 ? "2 JAM" : "1 JAM";
                body.innerHTML += `<tr><td class="p-4 font-mono text-[9px] text-center">${formatHariTanggal(d.date)}</td><td class="p-4 text-center font-black text-rose-500 text-[9px]">${d.start}-${d.end}</td><td class="p-4 uppercase text-[9px] font-bold text-center sm:text-left"><div class="arika-history-desc-full">${escapeHTMLPreserveLines(d.desc)}</div></td><td class="p-4 text-center font-black text-slate-900 text-[9px] flex items-center justify-center gap-2">${durStr} <button onclick="window.hapusJurnal('${d.date}', \`${d.desc.replace(/[`'"]/g, '')}\`)" class="p-1 bg-rose-50 text-rose-600 rounded text-[8px] hover:bg-rose-500 hover:text-white transition-colors">🗑️</button></td></tr>`;
            });
        };

        // --- 🔍 FILTER DAN PENCARIAN TERFUNGSI ---

        function buildHistoryPaginationHtml(page, totalPages, totalItems, handlerName) {
            if(totalPages <= 1) return '';
            const safePage = Math.max(1, Math.min(page, totalPages));
            const pages = [];
            const start = Math.max(1, safePage - 2);
            const end = Math.min(totalPages, safePage + 2);
            for(let i = start; i <= end; i++) pages.push(i);

            const btnClass = 'px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-colors';
            const inactive = 'bg-white text-slate-500 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700';
            const active = 'bg-emerald-600 text-white border-emerald-600 shadow-sm';

            return `
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center sm:text-left">Total ${totalItems} data • Halaman ${safePage} dari ${totalPages}</p>
                    <div class="flex items-center justify-center gap-2 flex-wrap">
                        <button onclick="${handlerName}(${safePage - 1})" ${safePage <= 1 ? 'disabled' : ''} class="${btnClass} ${inactive} disabled:opacity-40 disabled:cursor-not-allowed">Sebelumnya</button>
                        ${start > 1 ? `<button onclick="${handlerName}(1)" class="${btnClass} ${inactive}">1</button>${start > 2 ? '<span class="text-slate-300 font-black">...</span>' : ''}` : ''}
                        ${pages.map(i => `<button onclick="${handlerName}(${i})" class="${btnClass} ${i === safePage ? active : inactive}">${i}</button>`).join('')}
                        ${end < totalPages ? `${end < totalPages - 1 ? '<span class="text-slate-300 font-black">...</span>' : ''}<button onclick="${handlerName}(${totalPages})" class="${btnClass} ${inactive}">${totalPages}</button>` : ''}
                        <button onclick="${handlerName}(${safePage + 1})" ${safePage >= totalPages ? 'disabled' : ''} class="${btnClass} ${inactive} disabled:opacity-40 disabled:cursor-not-allowed">Berikutnya</button>
                    </div>
                </div>
            `;
        }

        window.setPersonalHistoryPage = function(page) {
            window.personalHistoryPage = Number(page) || 1;
            window.runFilter({ keepPage: true });
        };

        function renderPersonalHistoryPage() {
            const tbody = document.getElementById('tbl-body');
            const pagination = document.getElementById('personal-history-pagination');
            if(!tbody) return;

            const total = filtered.length;
            const totalPages = Math.max(1, Math.ceil(total / ARIKA_HISTORY_PAGE_SIZE));
            window.personalHistoryPage = Math.max(1, Math.min(Number(window.personalHistoryPage) || 1, totalPages));
            const startIndex = (window.personalHistoryPage - 1) * ARIKA_HISTORY_PAGE_SIZE;
            const rows = filtered.slice(startIndex, startIndex + ARIKA_HISTORY_PAGE_SIZE);

            if(total === 0) {
                const totalRows = (window.arikaData || []).length;
                const samePersonRows = (window.arikaData || []).filter(d => personMatchesRow(d, window.currentUser)).length;
                const msg = totalRows === 0
                    ? 'Data jurnal belum terbaca dari Google Sheet. Klik Sinkron Sheet / refresh ARIKA.'
                    : (samePersonRows === 0
                        ? 'Data jurnal sudah terbaca, tetapi belum ada baris yang cocok dengan nama/NIP akun ini. Pastikan baris Sheet Jurnal memiliki kolom Pelaksana/NIP berisi nama atau NIP pegawai yang sama.'
                        : 'Ada data jurnal untuk akun ini, tetapi tidak cocok dengan filter rentang/kategori/status saat ini. Klik Semua Waktu atau bersihkan filter.');
                tbody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-slate-400 italic text-[9px] uppercase font-black">${msg}</td></tr>`;
                if(pagination) {
                    pagination.classList.add('hidden');
                    pagination.innerHTML = '';
                }
                return;
            }

            tbody.innerHTML = rows.map(d => {
                const badgeColor = d.status === 'Selesai' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600';
                const dataLink = renderDataDukungLink(d.linkDataDukung);
                const reviewBox = renderCatatanAtasanBox(d);
                return `<tr><td class="p-4 text-center font-mono text-slate-400 text-[9px]">${formatHariTanggal(d.date)}</td><td class="p-4 text-center font-bold text-slate-700 text-[10px] sm:text-left max-w-[420px]"><div class="arika-history-desc-full text-slate-700 normal-case">${escapeHTMLPreserveLines(d.desc)}</div>${dataLink}${reviewBox}</td><td class="p-4 text-center flex items-center justify-center gap-2"><span class="px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${badgeColor}">${escapeHTML(d.status)}</span><button onclick="window.editJurnal('${escapeHTML(d.id)}')" class="p-1.5 bg-cyan-50 text-cyan-700 rounded-md font-black hover:bg-cyan-600 hover:text-white transition-colors text-[10px]">✏️</button><button onclick="window.hapusJurnal('${escapeHTML(d.date)}', \`${escapeHTML(d.desc).replaceAll('`', '')}\`, '${escapeHTML(d.id)}')" class="p-1.5 bg-rose-50 text-rose-600 rounded-md font-black hover:bg-rose-500 hover:text-white transition-colors">🗑️</button></td></tr>`;
            }).join('');

            if(pagination) {
                pagination.innerHTML = buildHistoryPaginationHtml(window.personalHistoryPage, totalPages, total, 'window.setPersonalHistoryPage');
                pagination.classList.toggle('hidden', total <= ARIKA_HISTORY_PAGE_SIZE);
            }
        }

        window.setAdminHistoryPage = function(page) {
            window.adminHistoryPage = Number(page) || 1;
            window.renderAdminAnalytics({ keepPage: true });
        };

        function renderAdminHistoryPage(rows) {
            const tbody = document.getElementById('admin-history-body');
            const pagination = document.getElementById('admin-history-pagination');
            const countEl = document.getElementById('admin-history-count');
            if(!tbody) return;

            const sortedRows = [...(rows || [])].sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            const total = sortedRows.length;
            if(countEl) countEl.innerText = `${total} Data`;

            const totalPages = Math.max(1, Math.ceil(total / ARIKA_HISTORY_PAGE_SIZE));
            window.adminHistoryPage = Math.max(1, Math.min(Number(window.adminHistoryPage) || 1, totalPages));
            const startIndex = (window.adminHistoryPage - 1) * ARIKA_HISTORY_PAGE_SIZE;
            const pageRows = sortedRows.slice(startIndex, startIndex + ARIKA_HISTORY_PAGE_SIZE);

            if(total === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic text-[9px] uppercase font-black">Belum ada riwayat catatan kegiatan pada filter ini</td></tr>';
                if(pagination) {
                    pagination.classList.add('hidden');
                    pagination.innerHTML = '';
                }
                return;
            }

            tbody.innerHTML = pageRows.map(d => {
                const badgeColor = normalize(d.status) === normalize('Selesai') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600';
                return `
                    <tr class="hover:bg-slate-50">
                        <td class="p-4 font-mono text-[9px] text-slate-400">${escapeHTML(formatHariTanggal(d.date))}</td>
                        <td class="p-4 font-black text-[10px] text-slate-800 uppercase">${escapeHTML(d.name || '-')}</td>
                        <td class="p-4 text-[10px] font-bold text-slate-500">${escapeHTML(d.lab || '-')}</td>
                        <td class="p-4 text-[10px] font-bold text-slate-700 leading-relaxed"><div class="arika-admin-history-desc-full">${escapeHTMLPreserveLines(d.desc || '-')}</div>${renderDataDukungLink(d.linkDataDukung)}${renderCatatanAtasanBox(d, { compact: true })}</td>
                        <td class="p-4 text-center">
                            <div class="flex flex-col items-center gap-2">
                                <span class="px-2 py-1 rounded-full text-[8px] font-black uppercase ${badgeColor}">${escapeHTML(d.status || '-')}</span>
                                <button onclick="window.openJurnalReviewModal('${escapeHTML(d.id)}')" class="px-2 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-600 text-cyan-700 hover:text-white text-[8px] font-black uppercase tracking-widest transition-colors">💬 Catatan</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            if(pagination) {
                pagination.innerHTML = buildHistoryPaginationHtml(window.adminHistoryPage, totalPages, total, 'window.setAdminHistoryPage');
                pagination.classList.toggle('hidden', total <= ARIKA_HISTORY_PAGE_SIZE);
            }
        }

        window.runFilter = function(options = {}) {
            const tbody = document.getElementById('tbl-body');
            if(!tbody) return;

            const targetName = normalize(window.currentUser?.nama || '');
            const targetNip = normalize(window.currentUser?.nip || '');
            const searchKeyword = normalize(document.getElementById('search-keyword')?.value || '');
            const categorySelect = document.getElementById('filter-rekap-cat')?.value || 'Semua';
            const statusSelect = document.getElementById('filter-rekap-status')?.value || 'Semua';
            const { start: rangeStart, end: rangeEnd } = getDateRangeValues('filter-rekap-start', 'filter-rekap-end');
            const signature = `${targetName}|${targetNip}|${searchKeyword}|${categorySelect}|${statusSelect}|${rangeStart}|${rangeEnd}`;

            if(!options.keepPage && window.personalHistorySignature !== signature) {
                window.personalHistoryPage = 1;
                window.personalHistorySignature = signature;
            }

            filtered = applyJurnalDeleteTombstones(window.arikaData || [])
                .filter(d => {
                    const matchesUser = personMatchesRow(d, window.currentUser);
                    const matchesKeyword = !searchKeyword || normalize(d.desc).includes(searchKeyword);
                    const matchesCategory = categorySelect === 'Semua' || d.cat === categorySelect;
                    const matchesStatus = statusSelect === 'Semua' || d.status === statusSelect;
                    const matchesRange = dateInRange(d.date, rangeStart, rangeEnd);
                    return matchesUser && matchesKeyword && matchesCategory && matchesStatus && matchesRange;
                })
                .sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

            renderPersonalHistoryPage();
            window.renderCharts();
            window.renderTrendChart();
        };

        // --- 📊 RENDER GRAFIK UTAMA RINGKASAN JURNAL (DOUGHNUT) ---
        window.renderCharts = function() {
            const stats = { 'Selesai': 0, 'Belum Selesai': 0 };
            const dataToUse = (typeof filtered !== 'undefined' && filtered && filtered.length > 0) ? filtered : [];
            
            dataToUse.forEach(d => {
                if (stats[d.status] !== undefined) {
                    stats[d.status]++;
                }
            });

            const ctx = document.getElementById('chart-status');
            if (ctx) {
                if (window.chartS) window.chartS.destroy();
                window.chartS = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(stats),
                        datasets: [{
                            data: Object.values(stats),
                            backgroundColor: ['#10b981', '#f43f5e'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '75%',
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    boxWidth: 10,
                                    font: { size: 10, weight: 'bold' }
                                }
                            }
                        }
                    }
                });
            }
        };

        // --- 📊 RENDER GRAFIK TREN AKTIVITAS MINGGUAN ---
        window.renderTrendChart = function() {
            const ctx = document.getElementById('chart-trend');
            if (!ctx) return;

            // Ekstrak jumlah entri per tanggal yang difilter
            const dates = {};
            filtered.forEach(d => {
                dates[d.date] = (dates[d.date] || 0) + 1;
            });

            // Urutkan tanggal dari terlama ke terbaru
            const sortedDates = Object.keys(dates).sort((a,b) => new Date(a) - new Date(b)).slice(-7); // Ambil 7 data terakhir
            const counts = sortedDates.map(date => dates[date]);

            if (window.chartTrendInstance) {
                window.chartTrendInstance.destroy();
            }

            window.chartTrendInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: sortedDates.map(d => d.split('-').slice(1).reverse().join('/')), // format MM/DD
                    datasets: [{
                        label: 'Jumlah Aktivitas',
                        data: counts,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: '#10b981'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } },
                        x: { grid: { display: false } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        };

        // --- 📅 DATA TANGGAL MERAH DINAMIS ---
        // 2026 tetap disediakan sebagai default. Mulai 2027 dan seterusnya,
        // kalender membaca sheet "KalenderLibur" agar tidak perlu edit kode HTML tiap tahun.
        const ARIKA_DEFAULT_HOLIDAY_MAP_2026 = {
            '2026-01-01': { type: 'holiday', label: 'Tahun Baru Masehi' },
            '2026-01-16': { type: 'holiday', label: 'Isra Mikraj' },
            '2026-02-16': { type: 'leave', label: 'Cuti Bersama Imlek' },
            '2026-02-17': { type: 'holiday', label: 'Tahun Baru Imlek' },
            '2026-03-18': { type: 'leave', label: 'Cuti Bersama Nyepi' },
            '2026-03-19': { type: 'holiday', label: 'Hari Suci Nyepi' },
            '2026-03-20': { type: 'leave', label: 'Cuti Bersama Idul Fitri' },
            '2026-03-21': { type: 'holiday', label: 'Idul Fitri' },
            '2026-03-22': { type: 'holiday', label: 'Idul Fitri' },
            '2026-03-23': { type: 'leave', label: 'Cuti Bersama Idul Fitri' },
            '2026-03-24': { type: 'leave', label: 'Cuti Bersama Idul Fitri' },
            '2026-04-03': { type: 'holiday', label: 'Wafat Yesus Kristus' },
            '2026-04-05': { type: 'holiday', label: 'Paskah' },
            '2026-05-01': { type: 'holiday', label: 'Hari Buruh' },
            '2026-05-14': { type: 'holiday', label: 'Kenaikan Yesus Kristus' },
            '2026-05-15': { type: 'leave', label: 'Cuti Bersama Kenaikan Yesus' },
            '2026-05-27': { type: 'holiday', label: 'Idul Adha' },
            '2026-05-28': { type: 'leave', label: 'Cuti Bersama Idul Adha' },
            '2026-05-31': { type: 'holiday', label: 'Hari Raya Waisak' },
            '2026-06-01': { type: 'holiday', label: 'Hari Lahir Pancasila' },
            '2026-06-16': { type: 'holiday', label: 'Tahun Baru Islam' },
            '2026-08-17': { type: 'holiday', label: 'Hari Kemerdekaan RI' },
            '2026-08-25': { type: 'holiday', label: 'Maulid Nabi Muhammad' },
            '2026-12-24': { type: 'leave', label: 'Cuti Bersama Natal' },
            '2026-12-25': { type: 'holiday', label: 'Hari Raya Natal' }
        };

        function normalizeHolidayType(jenis) {
            const key = normalize(jenis);
            if(key.includes('cuti') || key.includes('bersama') || key.includes('leave')) return 'leave';
            if(key.includes('libur') || key.includes('nasional') || key.includes('holiday') || key.includes('tanggalmerah')) return 'holiday';
            return 'holiday';
        }

        function getDynamicHolidayMap() {
            const map = { ...ARIKA_DEFAULT_HOLIDAY_MAP_2026 };
            (window.kalenderLiburData || []).forEach(item => {
                if(!item || item.aktif === false || !item.tanggal) return;
                map[item.tanggal] = {
                    type: normalizeHolidayType(item.jenis || item.type || 'Libur Nasional'),
                    label: item.keterangan || item.label || item.nama || item.jenis || 'Tanggal Merah'
                };
            });
            return map;
        }

        function getCalendarDayInfo(dateKey) {
            const [y, m, d] = String(dateKey || '').split('-').map(Number);
            const dt = new Date(y, (m || 1) - 1, d || 1);
            const dayIndex = dt.getDay();
            const isWeekend = dayIndex === 0 || dayIndex === 6;
            const special = getDynamicHolidayMap()[dateKey] || null;
            const type = special?.type || (isWeekend ? 'weekend' : 'workday');

            return {
                dateKey,
                dayIndex,
                isWeekend,
                isHoliday: type === 'holiday' || type === 'leave' || isWeekend,
                type,
                label: special?.label || (isWeekend ? 'Akhir Pekan' : 'Hari Kerja')
            };
        }
        // --- 📅 RENDER KALENDER VISUAL BULANAN ---
        window.renderVisualCalendar = function() {
            const grid = document.getElementById('calendar-grid');
            if(!grid) return;

            const rangeStart = document.getElementById('filter-rekap-start')?.value || '';
            const rangeEnd = document.getElementById('filter-rekap-end')?.value || '';
            const filterMonthVal = (rangeStart || rangeEnd || getTodayKey()).substring(0, 7);
            const [year, month] = filterMonthVal.split('-').map(Number);
            const monthTitle = document.getElementById('calendar-month-title');
            if(monthTitle) monthTitle.innerText = `Kalender ${formatBulanIndonesia(filterMonthVal)} • Klik tanggal untuk melihat detail aktivitas`;

            const firstDayIndex = new Date(year, month - 1, 1).getDay();
            const totalDays = new Date(year, month, 0).getDate();
            const currentName = normalize(window.currentUser?.nama || '');
            const activityByDate = new Map();

            (window.arikaData || []).forEach(d => {
                const date = String(d.date || '');
                if(!date.startsWith(filterMonthVal)) return;
                if(normalize(d.name) !== currentName) return;
                if(!activityByDate.has(date)) activityByDate.set(date, []);
                activityByDate.get(date).push(d);
            });

            let calendarHtml = '';
            for(let i = 0; i < firstDayIndex; i++) {
                calendarHtml += `<div class="min-h-[54px] md:min-h-[64px] rounded-2xl border border-slate-50 bg-slate-50/40"></div>`;
            }

            for(let day = 1; day <= totalDays; day++) {
                const dateKey = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                const info = getCalendarDayInfo(dateKey);
                const daysActivities = activityByDate.get(dateKey) || [];
                const hasActivity = daysActivities.length > 0;
                const allDone = hasActivity ? daysActivities.every(a => normalize(a.status) === normalize('Selesai')) : false;

                let dayClass = 'calendar-workday';
                let numColor = 'text-slate-700';
                if(info.type === 'weekend') { dayClass = 'calendar-weekend'; numColor = 'text-rose-600'; }
                if(info.type === 'holiday') { dayClass = 'calendar-holiday'; numColor = 'text-rose-700'; }
                if(info.type === 'leave') { dayClass = 'calendar-leave'; numColor = 'text-amber-700'; }

                const todayClass = dateKey === getTodayKey() ? 'calendar-today' : '';
                const activityDot = hasActivity
                    ? `<span class="inline-flex items-center gap-1 text-[8px] font-black uppercase ${allDone ? 'text-emerald-700' : 'text-rose-700'}"><i class="w-2 h-2 rounded-full ${allDone ? 'bg-emerald-500' : 'bg-rose-500'} inline-block"></i>${daysActivities.length}</span>`
                    : `<span class="inline-block w-2 h-2 rounded-full ${info.isHoliday ? 'bg-rose-300' : 'bg-slate-200'}"></span>`;

                calendarHtml += `
                    <div onclick="window.showCalendarDayDetail('${dateKey}')" class="calendar-day-card ${dayClass} ${todayClass}">
                        <div class="flex items-start justify-between gap-1">
                            <span class="calendar-day-number ${numColor}">${day}</span>
                            ${activityDot}
                        </div>
                        <div class="calendar-day-label ${info.isHoliday ? (info.type === 'leave' ? 'text-amber-700' : 'text-rose-700') : 'text-slate-400'}">${escapeHTML(info.label)}</div>
                    </div>
                `;
            }
            grid.innerHTML = calendarHtml;
        };

        window.showCalendarDayDetail = function(dateKey) {
            const modal = document.getElementById('calendar-modal');
            const title = document.getElementById('modal-date-title');
            const list = document.getElementById('modal-activities-list');
            
            if(!modal || !title || !list) return;

            const dayInfo = getCalendarDayInfo(dateKey);
            title.innerText = `${formatHariTanggal(dateKey)} • ${dayInfo.label}`;
            list.innerHTML = `
                <div class="mb-3 p-3 rounded-xl ${dayInfo.isHoliday ? (dayInfo.type === 'leave' ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-rose-50 text-rose-800 border border-rose-100') : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}">
                    <p class="text-[10px] font-black uppercase tracking-widest">${dayInfo.isHoliday ? 'Tanggal Merah / Libur' : 'Hari Kerja'}</p>
                    <p class="text-xs font-bold mt-1">${escapeHTML(dayInfo.label)}</p>
                </div>
            `;

            const dayActivities = window.arikaData.filter(d => 
                normalize(d.name) === normalize(window.currentUser?.nama || '') && d.date === dateKey
            );

            if(dayActivities.length === 0) {
                list.innerHTML += `<p class="text-center text-slate-400 italic text-xs py-4">Tidak ada riwayat aktivitas tercatat.</p>`;
            } else {
                dayActivities.forEach((act) => {
                    const statusClass = act.status === 'Selesai' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';
                    list.innerHTML += `
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <div class="flex justify-between items-start gap-2 mb-2">
                                <span class="text-[9px] uppercase font-black text-slate-400">${escapeHTML(act.cat)}</span>
                                <span class="px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${statusClass}">${escapeHTML(act.status)}</span>
                            </div>
                            <p class="arika-calendar-activity-desc text-xs font-bold text-slate-700">${escapeHTMLPreserveLines(act.desc)}</p>
                        </div>
                    `;
                });
            }

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modal.style.display = 'flex';
        };

        window.closeCalendarModal = function() {
            const modal = document.getElementById('calendar-modal');
            if(modal) {
                modal.style.display = 'none';
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        };

        // --- 📥 EXPORT EXCEL LAPORAN JURNAL PRIBADI ---
        window.downloadPersonalJurnalExcel = function() {
            if(!window.currentUser) {
                if(typeof window.showCustomAlert === 'function') window.showCustomAlert('Silakan login terlebih dahulu.');
                else alert('Silakan login terlebih dahulu.');
                return;
            }

            const rows = Array.isArray(filtered) ? filtered : [];
            const startFilter = document.getElementById('filter-rekap-start')?.value || '';
            const endFilter = document.getElementById('filter-rekap-end')?.value || '';
            const catFilter = document.getElementById('filter-rekap-cat')?.value || 'Semua';
            const statusFilter = document.getElementById('filter-rekap-status')?.value || 'Semua';
            const periode = startFilter || endFilter ? `${startFilter || 'awal'} s.d. ${endFilter || 'akhir'}` : 'Semua waktu';
            const safeName = String(window.currentUser.nama || 'pegawai')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'pegawai';
            const tanggalUnduh = formatDateIndo(new Date());
            const filename = `riwayat-jurnal-${safeName}-${startFilter || 'awal'}-${endFilter || 'akhir'}.xls`;

            const cellStyle = 'border:1px solid #999;padding:7px;vertical-align:top;';
            const headStyle = cellStyle + 'background:#e2e8f0;font-weight:bold;text-align:center;';
            let bodyRows = '';

            if(rows.length) {
                rows.forEach((d, i) => {
                    bodyRows += `
                        <tr>
                            <td style="${cellStyle}text-align:center;">${i + 1}</td>
                            <td style="${cellStyle}text-align:center;">${escapeHTML(formatDateIndo(d.date))}</td>
                            <td style="${cellStyle}text-align:center;">${escapeHTML(d.cat || '-')}</td>
                            <td style="${cellStyle}">${escapeHTML(d.desc || '-')}</td>
                            <td style="${cellStyle}text-align:center;font-weight:bold;">${escapeHTML(d.status || '-')}</td>
                            <td style="${cellStyle}">${escapeHTML(d.review || d.catatan || d.note || '-')}</td>
                        </tr>
                    `;
                });
            } else {
                bodyRows = `<tr><td colspan="6" style="${cellStyle}text-align:center;">Belum ada riwayat jurnal pada filter yang dipilih.</td></tr>`;
            }

            const tableHtml = `
                <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:11pt;">
                    <tr><td colspan="6" style="font-size:16pt;font-weight:bold;text-align:center;padding:8px;">RIWAYAT JURNAL KEGIATAN HARIAN</td></tr>
                    <tr><td colspan="6" style="text-align:center;padding:6px;">ARIKA - BPOM AMBON</td></tr>
                    <tr><td colspan="6" style="padding:6px;"></td></tr>
                    <tr><td style="font-weight:bold;${cellStyle}">Nama</td><td colspan="5" style="${cellStyle}">${escapeHTML(window.currentUser.nama || '-')}</td></tr>
                    <tr><td style="font-weight:bold;${cellStyle}">NIP</td><td colspan="5" style="${cellStyle}">${escapeHTML(window.currentUser.nip || '-')}</td></tr>
                    <tr><td style="font-weight:bold;${cellStyle}">Laboratorium/Fungsi</td><td colspan="5" style="${cellStyle}">${escapeHTML(window.currentUser.lab || '-')}</td></tr>
                    <tr><td style="font-weight:bold;${cellStyle}">Periode</td><td colspan="5" style="${cellStyle}">${escapeHTML(periode)}</td></tr>
                    <tr><td style="font-weight:bold;${cellStyle}">Filter</td><td colspan="5" style="${cellStyle}">Kategori: ${escapeHTML(catFilter)} | Status: ${escapeHTML(statusFilter)}</td></tr>
                    <tr><td style="font-weight:bold;${cellStyle}">Tanggal Unduh</td><td colspan="5" style="${cellStyle}">${escapeHTML(tanggalUnduh)}</td></tr>
                    <tr><td colspan="6" style="padding:6px;"></td></tr>
                    <tr>
                        <td style="${headStyle}">No.</td>
                        <td style="${headStyle}">Tanggal</td>
                        <td style="${headStyle}">Kategori</td>
                        <td style="${headStyle}">Uraian Kegiatan / Pekerjaan</td>
                        <td style="${headStyle}">Status</td>
                        <td style="${headStyle}">Catatan / Review</td>
                    </tr>
                    ${bodyRows}
                </table>
            `;

            downloadXls(filename, tableHtml);
        };

        // Alias lama tetap diarahkan ke Excel agar tidak ada pemanggilan PDF dari cache/tombol lama.
        window.printPersonalPDF = function() {
            return window.downloadPersonalJurnalExcel();
        };

        // --- 👥 REKAP JURNAL PEGAWAI (ADMIN EXCLUSIVE) ---
        window.switchAdminTab = function(tabName) {
            if(!canAccessAdminPanel()) return window.showCustomAlert('Akses admin/verifikator diperlukan.');
            const tabIds = ['pegawai', 'analitik', 'lembur', 'survei', 'rekap', 'pengumuman', 'agenda'];
            const allowed = getAllowedAdminTabsByRole();
            if(!allowed.includes(tabName)) {
                tabName = allowed.includes('lembur') ? 'lembur' : allowed[0];
                if(!tabName) return;
            }

            tabIds.forEach(id => {
                const tab = document.getElementById('admin-tab-' + id);
                const content = document.getElementById('admin-content-' + id);
                const isAllowed = allowed.includes(id);
                if(tab) {
                    tab.classList.toggle('hidden', !isAllowed);
                    tab.classList.toggle('is-active', isAllowed && id === tabName);
                    tab.disabled = !isAllowed;
                }
                if(content) content.classList.toggle('hidden', id !== tabName || !isAllowed);
            });

            applyAdminRoleAccess && applyAdminRoleAccess();

            if(tabName === 'analitik') window.renderAdminAnalytics();
            if(tabName === 'lembur') window.renderAdminOvertimeDashboard();
            if(tabName === 'survei') window.renderAdminSurvei();
            if(tabName === 'rekap') window.renderAdminAllTable();
            if(tabName === 'pengumuman') {
                setDefaultDates();
                window.renderAdminPengumuman();
            }
            if(tabName === 'agenda') {
                window.renderAgendaPegawaiOptions();
                window.resetFormAgenda();
                window.renderAdminAgenda();
            }
        };

        function getAdminAnalyticsRows() {
            const monthVal = document.getElementById('admin-analytics-month')?.value || getCurrentMonth();
            const labSelect = document.getElementById('admin-analytics-lab')?.value || 'Semua';
            const rows = getRoleScopedJurnalRows().filter(d => {
                const matchesMonth = !monthVal || String(d.date || '').startsWith(monthVal);
                const matchesLab = labMatches(d.lab, labSelect);
                return matchesMonth && matchesLab;
            });
            return { rows, monthVal, labSelect };
        }

        function getAdminAnalyticsStats() {
            const { rows, monthVal, labSelect } = getAdminAnalyticsRows();
            const employeesInScope = getRoleScopedPegawaiRows().filter(p => labMatches(p.lab, labSelect));
            const activeNames = new Set(rows.map(d => normalize(d.name)).filter(Boolean));
            const lemburRows = rows.filter(d => d.isLembur);
            const selesaiCount = rows.filter(d => normalize(d.status) === normalize('Selesai')).length;
            const belumCount = rows.filter(d => normalize(d.status).includes('belum')).length;
            const totalMinutes = lemburRows.reduce((sum, d) => sum + getLemburMinutesForRow(d), 0);
            const labCounts = countBy(rows, d => d.lab || 'Belum Ada Lab');
            const catCounts = countBy(rows, d => d.cat || 'Lainnya');
            const statusCounts = countBy(rows, d => d.status || 'Tanpa Status');
            const topLab = Object.entries(labCounts).sort((a,b) => b[1] - a[1])[0] || ['-', 0];
            const topCat = Object.entries(catCounts).sort((a,b) => b[1] - a[1])[0] || ['-', 0];
            const completionRate = rows.length ? Math.round((selesaiCount / rows.length) * 100) : 0;
            const activeRate = employeesInScope.length ? Math.round((activeNames.size / employeesInScope.length) * 100) : 0;
            return { rows, monthVal, labSelect, employeesInScope, activeNames, lemburRows, selesaiCount, belumCount, totalMinutes, labCounts, catCounts, statusCounts, topLab, topCat, completionRate, activeRate };
        }

        function countBy(rows, keyFn) {
            const out = {};
            rows.forEach(row => {
                const key = String(keyFn(row) || '-');
                out[key] = (out[key] || 0) + 1;
            });
            return out;
        }

        function parseLamaLemburMenit(value) {
            const raw = String(value || '').trim().toLowerCase().replace(',', '.');
            if(!raw) return 0;
            const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(jam|j|hour|hours)?/);
            if(!hourMatch) return 0;
            const hours = Number(hourMatch[1]);
            if(Number.isNaN(hours)) return 0;
            const minuteMatch = raw.match(/(\d+)\s*(menit|mnt|min)/);
            const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
            return Math.round(hours * 60) + (Number.isNaN(minutes) ? 0 : minutes);
        }

        function setAdminText(id, text) {
            const el = document.getElementById(id);
            if(el) el.innerText = text;
        }

        // Alias aman untuk modul Dashboard Lembur.
        // Pada v98 fungsi render memakai setText(), sedangkan fungsi utilitas yang tersedia adalah setAdminText().
        // Akibatnya proses render berhenti setelah diagnostik, sehingga KPI/tabel tetap terlihat 0 walau data ekspor Word/XLS sudah terbaca.
        function setText(id, text) {
            setAdminText(id, text);
        }

        function renderChart(canvasId, instanceName, type, labels, data, options = {}) {
            const ctx = document.getElementById(canvasId);
            if(!ctx || typeof Chart === 'undefined') return;
            if(window[instanceName]) window[instanceName].destroy();

            const isMobile = window.innerWidth < 640;
            const palette = ['#10b981', '#06b6d4', '#6366f1', '#f59e0b', '#f43f5e', '#14b8a6', '#8b5cf6'];

            const styledData = (data || []).map((ds, idx) => {
                const base = { ...ds };
                if(type === 'bar') {
                    base.borderRadius = base.borderRadius ?? 12;
                    base.borderSkipped = false;
                    if(!base.backgroundColor || typeof base.backgroundColor === 'string') {
                        base.backgroundColor = (labels || []).map((_, i) => palette[(i + idx) % palette.length]);
                    }
                }
                if(type === 'line') {
                    base.pointRadius = isMobile ? 2 : 4;
                    base.pointHoverRadius = isMobile ? 5 : 7;
                    base.tension = base.tension ?? 0.38;
                }
                if(type === 'doughnut') {
                    base.hoverOffset = 8;
                }
                return base;
            });

            window[instanceName] = new Chart(ctx, {
                type,
                data: {
                    labels,
                    datasets: styledData
                },
                options: Object.assign({
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: isMobile ? 4 : 10 },
                    plugins: {
                        legend: {
                            position: isMobile ? 'bottom' : 'bottom',
                            labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: { size: isMobile ? 9 : 10, weight: 'bold' } }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15,23,42,.92)',
                            padding: 10,
                            titleFont: { weight: 'bold' },
                            bodyFont: { weight: 'bold' },
                            cornerRadius: 12
                        }
                    },
                    scales: type === 'doughnut' ? undefined : {
                        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: isMobile ? 9 : 10 } }, grid: { color: 'rgba(148,163,184,.16)' } },
                        x: { ticks: { font: { size: isMobile ? 8 : 10 }, maxRotation: isMobile ? 45 : 0, minRotation: 0 }, grid: { display: false } }
                    }
                }, options)
            });
        }

        function getMonthKeyOffset(monthKey, offset) {
            const [year, month] = String(monthKey || getCurrentMonth()).split('-').map(Number);
            const d = new Date(year || new Date().getFullYear(), (month || 1) - 1 + offset, 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }

        function getLemburMinutesForRow(d) {
            const byTime = hitungDurasiMenit(d.start, d.end);
            if(byTime > 0) return byTime;
            return parseLamaLemburMenit(d.lamaLembur);
        }

        function isTruthyLemburValue(value) {
            if(value === true) return true;
            if(value === false || value === null || value === undefined) return false;
            const raw = String(value).trim().toLowerCase();
            if(!raw) return false;
            const normalizedRaw = normalize(raw);

            // Nilai negatif harus dibaca lebih dulu agar teks seperti "Tidak Lembur" tidak ikut terbaca.
            if(['false', 'tidak', 'tidaklembur', 'bukan', 'bukanlembur', 'nonlembur', 'no', 'n', '0', 'kosong', 'null', 'undefined'].includes(normalizedRaw)) return false;
            if(normalizedRaw.includes('tidak') || normalizedRaw.includes('bukan') || normalizedRaw.includes('nonlembur') || normalizedRaw.includes('false')) return false;

            if(['true', 'ya', 'iya', 'y', 'yes', '1', 'lembur', 'checked', 'centang', 'benar', 'aktif', 'ok', 'v', 'x'].includes(normalizedRaw)) return true;
            if(raw === '✓' || raw === '✔' || raw === '☑') return true;
            if(normalizedRaw.includes('true') || normalizedRaw.includes('dicentang')) return true;
            return false;
        }

        function hasExplicitLemburMarker(d) {
            if(!d) return false;

            // Sumber utama: kolom/field checkbox "Lembur?" dari jurnal ARIKA.
            // Dashboard lembur tidak menebak dari jam, surat tugas, durasi, atau kata "lembur" pada uraian.
            if(d.hasExplicitLemburMark === true) return true;

            // Baca ulang dari baris mentah Google Sheet agar tidak kalah oleh cache/mapping lama.
            const rawFlagInfo = getExplicitLemburFlagFromRow(d._rawRow || d);
            if(rawFlagInfo.found && isTruthyLemburValue(rawFlagInfo.value)) return true;

            if(isTruthyLemburValue(d.lemburFlagRaw)) return true;

            // Kompatibilitas untuk data lokal lama yang hanya punya isLembur.
            if(Object.prototype.hasOwnProperty.call(d, 'isLembur') && isTruthyLemburValue(d.isLembur)) return true;
            return false;
        }

        function isAdminOvertimeRow(d) {
            return hasExplicitLemburMarker(d);
        }

        function populateAdminOvertimeLabOptions() {
            const select = document.getElementById('admin-overtime-lab');
            if(!select) return;
            const current = select.value || 'Semua';
            const labs = new Set();
            (window.masterPegawai || []).forEach(p => { if(p.lab) labs.add(String(p.lab)); });
            (window.arikaData || []).forEach(d => { if(d.lab) labs.add(String(d.lab)); });
            const sortedLabs = Array.from(labs).filter(Boolean).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
            select.innerHTML = '<option value="Semua">Semua Fungsi/Lab</option>' + sortedLabs.map(lab => `<option value="${escapeHTML(lab)}">${escapeHTML(lab)}</option>`).join('');
            select.value = sortedLabs.includes(current) ? current : 'Semua';
            lockSelectToVerifierUnit('admin-overtime-lab');
        }

        function buildMonthlyOvertimeTrend(allRows, endMonth, labSelect = 'Semua') {
            const months = [];
            for(let i = 11; i >= 0; i--) months.push(getMonthKeyOffset(endMonth || getCurrentMonth(), -i));
            const totals = Object.fromEntries(months.map(m => [m, 0]));
            (allRows || [])
                .filter(d => isAdminOvertimeRow(d))
                .filter(d => !labSelect || labSelect === 'Semua' || labMatches(d.lab, labSelect))
                .forEach(d => {
                    const monthKey = String(d.date || '').slice(0, 7);
                    if(monthKey in totals) totals[monthKey] += getLemburMinutesForRow(d);
                });
            return {
                labels: months.map(m => formatBulanIndonesia(m).replace(/^(\S+)\s+/, (match, p1) => p1.slice(0, 3) + ' ')),
                values: months.map(m => Math.round((totals[m] / 60) * 10) / 10)
            };
        }

        function buildDailyTrend(rows, monthVal) {
            const daily = {};
            rows.forEach(d => {
                const key = String(d.date || '').slice(0, 10);
                if(!key) return;
                if(!daily[key]) daily[key] = { total: 0, lembur: 0 };
                daily[key].total += 1;
                if(d.isLembur) daily[key].lembur += 1;
            });
            const keys = Object.keys(daily).sort((a,b) => new Date(a) - new Date(b));
            return {
                labels: keys.map(k => k.slice(8,10) + '/' + k.slice(5,7)),
                total: keys.map(k => daily[k].total),
                lembur: keys.map(k => daily[k].lembur)
            };
        }

        function getTopContributors(rows) {
            const map = {};
            rows.forEach(d => {
                const key = d.name || '-';
                if(!map[key]) map[key] = { name: key, total: 0, selesai: 0, lembur: 0, days: new Set(), score: 0 };
                map[key].total += 1;
                if(normalize(d.status) === normalize('Selesai')) map[key].selesai += 1;
                if(d.isLembur) map[key].lembur += 1;
                if(d.date) map[key].days.add(d.date);
            });
            return Object.values(map).map(item => {
                item.score = (item.total * 2) + (item.selesai * 2) + (item.days.size * 3) + item.lembur;
                return item;
            }).sort((a,b) => b.score - a.score || b.total - a.total || a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })).slice(0, 5);
        }

        function buildMonevRows(stats) {
            const totalPegawai = stats.employeesInScope.length;
            const activeCount = stats.activeNames.size;
            const totalEntries = stats.rows.length;
            const lemburCount = stats.lemburRows.length;
            const jamLembur = Math.round((stats.totalMinutes / 60) * 10) / 10;
            const avgPerActive = activeCount ? (totalEntries / activeCount).toFixed(1) : '0';
            const completionLabel = stats.completionRate >= 85 ? 'Baik' : (stats.completionRate >= 65 ? 'Cukup' : 'Perlu Perhatian');
            const activeLabel = stats.activeRate >= 80 ? 'Baik' : (stats.activeRate >= 50 ? 'Cukup' : 'Perlu Didorong');
            return [
                {
                    indikator: 'Kedisiplinan input jurnal',
                    kondisi: `${activeCount}/${totalPegawai || 0} pegawai aktif mengisi (${stats.activeRate}%)`,
                    evaluasi: activeLabel,
                    rekomendasi: stats.activeRate >= 80 ? 'Pertahankan ritme input dan lakukan pengecekan berkala.' : 'Ingatkan pegawai yang belum aktif melalui pengumuman/admin briefing singkat.'
                },
                {
                    indikator: 'Produktivitas pencatatan',
                    kondisi: `${totalEntries} entri, rata-rata ${avgPerActive} entri per pegawai aktif`,
                    evaluasi: totalEntries > 0 ? 'Terpantau' : 'Belum Ada Data',
                    rekomendasi: totalEntries > 0 ? 'Gunakan data ini untuk melihat beban kerja dan pola kegiatan per fungsi.' : 'Pastikan pegawai mulai mencatat aktivitas harian melalui ARIKA.'
                },
                {
                    indikator: 'Ketuntasan pekerjaan',
                    kondisi: `${stats.selesaiCount} selesai, ${stats.belumCount} belum selesai (${stats.completionRate}%)`,
                    evaluasi: completionLabel,
                    rekomendasi: stats.belumCount > 0 ? 'Tindak lanjuti kegiatan berstatus belum selesai pada rapat/briefing berikutnya.' : 'Seluruh kegiatan yang tercatat sudah berstatus selesai.'
                },
                {
                    indikator: 'Monitoring lembur',
                    kondisi: `${lemburCount} entri lembur, estimasi ${jamLembur} jam`,
                    evaluasi: lemburCount > 0 ? 'Perlu Verifikasi' : 'Normal',
                    rekomendasi: lemburCount > 0 ? 'Pastikan SPK kolektif, form verifikasi, dan bukti presensi sesuai.' : 'Tidak ada aktivitas lembur tercatat pada periode ini.'
                },
                {
                    indikator: 'Distribusi fungsi kerja',
                    kondisi: `Fungsi paling aktif: ${stats.topLab[0]} (${stats.topLab[1]} entri)`,
                    evaluasi: stats.topLab[1] > 0 ? 'Terpantau' : 'Belum Ada Data',
                    rekomendasi: 'Bandingkan distribusi antar fungsi untuk melihat keseimbangan beban kerja dan kebutuhan dukungan.'
                }
            ];
        }

        window.renderAdminAnalytics = function(options = {}) {
            lockSelectToVerifierUnit('admin-analytics-lab');
            if(!canAccessAdminPanel()) return;
            setDefaultDates();
            const stats = getAdminAnalyticsStats();
            const historySignature = `${stats.monthVal}|${stats.labSelect}|${stats.rows.length}`;
            if(!options.keepPage && window.adminHistorySignature !== historySignature) {
                window.adminHistoryPage = 1;
                window.adminHistorySignature = historySignature;
            }
            const jamLembur = Math.round((stats.totalMinutes / 60) * 10) / 10;

            setAdminText('admin-kpi-total', String(stats.rows.length));
            setAdminText('admin-kpi-active', `${stats.activeNames.size}/${stats.employeesInScope.length || 0}`);
            setAdminText('admin-kpi-lembur', String(stats.lemburRows.length));
            setAdminText('admin-kpi-jam', String(jamLembur));
            setAdminText('admin-kpi-complete', `${stats.completionRate}%`);
            setAdminText('admin-report-period', `${formatBulanIndonesia(stats.monthVal)}${stats.labSelect !== 'Semua' ? ' • ' + stats.labSelect : ''}`);

            const trend = buildDailyTrend(stats.rows, stats.monthVal);
            renderChart('admin-chart-trend', 'adminChartTrend', 'line', trend.labels, [
                { label: 'Total Aktivitas', data: trend.total, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.16)', fill: true, tension: 0.42, borderWidth: 2 },
                { label: 'Lembur', data: trend.lembur, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.10)', fill: true, tension: 0.42, borderWidth: 2 }
            ], {
                layout: { padding: 2 },
                plugins: { legend: { position: 'top', labels: { boxWidth: 8, usePointStyle: true, pointStyle: 'circle', font: { size: window.innerWidth < 640 ? 8 : 9, weight: 'bold' } } } },
                elements: { point: { radius: window.innerWidth < 640 ? 2 : 2.5, hoverRadius: 5 } }
            });

            const labLabels = Object.keys(stats.labCounts);
            renderChart('admin-chart-lab', 'adminChartLab', 'bar', labLabels, [
                { label: 'Jumlah Aktivitas', data: labLabels.map(k => stats.labCounts[k]) }
            ], { plugins: { legend: { display: false } } });

            const statusLabels = Object.keys(stats.statusCounts);
            renderChart('admin-chart-status', 'adminChartStatus', 'doughnut', statusLabels, [
                { data: statusLabels.map(k => stats.statusCounts[k]), backgroundColor: ['#10b981', '#f43f5e', '#f59e0b', '#06b6d4'], borderWidth: 0 }
            ], { cutout: '70%' });

            const catLabels = Object.keys(stats.catCounts);
            renderChart('admin-chart-category', 'adminChartCategory', 'bar', catLabels, [
                { label: 'Kategori', data: catLabels.map(k => stats.catCounts[k]) }
            ], { indexAxis: 'y', plugins: { legend: { display: false } } });

            const overtimeTrend = buildMonthlyOvertimeTrend(window.arikaData || [], stats.monthVal, stats.labSelect);
            renderChart('admin-chart-overtime-monthly', 'adminChartOvertimeMonthly', 'bar', overtimeTrend.labels, [
                { label: 'Jam Lembur', data: overtimeTrend.values, backgroundColor: '#6366f1' }
            ], {
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: value => `${value} jam` }, grid: { color: 'rgba(148,163,184,.16)' } },
                    x: { grid: { display: false } }
                }
            });

            const topBody = document.getElementById('admin-top-contrib-body');
            if(topBody) {
                const top = getTopContributors(stats.rows);
                topBody.innerHTML = top.length ? top.map((p, i) => `
                    <tr>
                        <td class="py-3 pr-2"><div class="font-black text-slate-800 uppercase">${i + 1}. ${escapeHTML(p.name)}</div></td>
                        <td class="py-3 text-center font-black text-emerald-700">${p.score}</td>
                        <td class="py-3 text-center font-black text-emerald-600">${p.total}</td>
                        <td class="py-3 text-center font-black text-slate-500">${p.days?.size || 0}</td>
                        <td class="py-3 text-center font-black text-cyan-600">${p.lembur}</td>
                    </tr>
                `).join('') : '<tr><td colspan="5" class="py-6 text-center text-slate-400 italic">Belum ada data</td></tr>';
            }

            const reportBody = document.getElementById('admin-monthly-report-body');
            if(reportBody) {
                const topContrib = getTopContributors(stats.rows)[0];
                reportBody.innerHTML = `
                    <p>Pada periode <b>${escapeHTML(formatBulanIndonesia(stats.monthVal))}</b>${stats.labSelect !== 'Semua' ? ` untuk <b>${escapeHTML(stats.labSelect)}</b>` : ''}, ARIKA mencatat <b>${stats.rows.length}</b> entri aktivitas dari <b>${stats.activeNames.size}</b> pegawai aktif.</p>
                    <p>Tingkat ketuntasan pekerjaan berada pada angka <b>${stats.completionRate}%</b>, dengan <b>${stats.selesaiCount}</b> kegiatan selesai dan <b>${stats.belumCount}</b> kegiatan belum selesai.</p>
                    <p>Aktivitas lembur tercatat sebanyak <b>${stats.lemburRows.length}</b> entri dengan estimasi total <b>${jamLembur}</b> jam lembur. Kategori kegiatan terbanyak adalah <b>${escapeHTML(stats.topCat[0])}</b>, sedangkan fungsi/lab paling aktif adalah <b>${escapeHTML(stats.topLab[0])}</b>.</p>
                    <p>${topContrib ? `Kontributor terbanyak pada periode ini adalah <b>${escapeHTML(topContrib.name)}</b> dengan <b>${topContrib.total}</b> entri.` : 'Belum ada kontributor yang tercatat pada periode ini.'}</p>
                `;
            }

            const monevBody = document.getElementById('admin-monev-body');
            if(monevBody) {
                monevBody.innerHTML = buildMonevRows(stats).map(row => `
                    <tr class="hover:bg-slate-50">
                        <td class="p-4 font-black text-slate-900 uppercase text-[10px]">${escapeHTML(row.indikator)}</td>
                        <td class="p-4 text-[11px]">${escapeHTML(row.kondisi)}</td>
                        <td class="p-4"><span class="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[9px] font-black uppercase">${escapeHTML(row.evaluasi)}</span></td>
                        <td class="p-4 text-[11px] leading-relaxed">${escapeHTML(row.rekomendasi)}</td>
                    </tr>
                `).join('');
            }

            renderAdminHistoryPage(stats.rows);
        };

        // --- ⏱️ DASHBOARD PENGELOLAAN LEMBUR PERSONIL (ADMIN) ---
        function getAdminOvertimeRowStatus(d) {
            const hasSurat = !!String(d?.suratTugas || '').trim();
            const hasTime = !!(String(d?.start || '').trim() && String(d?.end || '').trim());
            const hasDukung = !!safeDataDukungUrl(d?.linkDataDukung || '');
            const hasReview = hasJurnalReview(d);
            const missing = [];
            if(!hasSurat) missing.push('Surat tugas');
            if(!hasTime) missing.push('Jam lembur');
            if(!hasDukung) missing.push('Data dukung');

            if(hasReview) {
                return {
                    code: 'Review',
                    label: 'Sudah Direview',
                    className: 'ot-status-review',
                    missing,
                    complete: missing.length === 0
                };
            }
            if(missing.length === 0) {
                return {
                    code: 'Siap',
                    label: 'Siap Verifikasi',
                    className: 'ot-status-ready',
                    missing,
                    complete: true
                };
            }
            return {
                code: 'Kurang',
                label: 'Perlu Lengkapi',
                className: 'ot-status-missing',
                missing,
                complete: false
            };
        }

        function getAdminOvertimeFilters() {
            const monthEl = document.getElementById('admin-overtime-month');
            return {
                // Kosong berarti semua periode. Ini mencegah dashboard tampak kosong ketika belum ada lembur di bulan berjalan.
                monthVal: monthEl?.value || '',
                labSelect: document.getElementById('admin-overtime-lab')?.value || 'Semua',
                statusSelect: document.getElementById('admin-overtime-status')?.value || 'Semua',
                searchText: normalize(document.getElementById('admin-overtime-search')?.value || '')
            };
        }

        function getAdminOvertimeRows() {
            const filters = getAdminOvertimeFilters();
            const rows = getRoleScopedJurnalRows().filter(d => {
                if(!isAdminOvertimeRow(d)) return false;
                if(filters.monthVal && !String(d.date || '').startsWith(filters.monthVal)) return false;
                if(!labMatches(d.lab, filters.labSelect)) return false;
                const statusInfo = getAdminOvertimeRowStatus(d);
                if(filters.statusSelect !== 'Semua' && statusInfo.code !== filters.statusSelect) return false;
                if(filters.searchText) {
                    const haystack = normalize([d.name, d.nip, d.lab, d.cat, d.desc, d.status, d.suratTugas, d.linkDataDukung, d.start, d.end, d.lamaLembur].join(' '));
                    if(!haystack.includes(filters.searchText)) return false;
                }
                return true;
            }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' }));
            return { rows, filters };
        }

        function buildAdminOvertimeStats(rows) {
            const personMap = new Map();
            const labHours = {};
            const statusCounts = { 'Siap Verifikasi': 0, 'Perlu Lengkapi': 0, 'Sudah Direview': 0 };
            let totalMinutes = 0;
            let readyRows = 0;
            let missingRows = 0;
            let reviewedRows = 0;

            (rows || []).forEach(d => {
                const minutes = getLemburMinutesForRow(d);
                totalMinutes += minutes;
                const statusInfo = getAdminOvertimeRowStatus(d);
                statusCounts[statusInfo.label] = (statusCounts[statusInfo.label] || 0) + 1;
                if(statusInfo.code === 'Siap') readyRows += 1;
                if(statusInfo.code === 'Kurang') missingRows += 1;
                if(statusInfo.code === 'Review') reviewedRows += 1;

                const labKey = d.lab || 'Tanpa Fungsi';
                labHours[labKey] = (labHours[labKey] || 0) + minutes;

                const pKey = normalize(d.nip || d.name || 'tanpa-nama') || `person-${personMap.size}`;
                if(!personMap.has(pKey)) {
                    personMap.set(pKey, {
                        name: d.name || '-',
                        nip: d.nip || '',
                        lab: d.lab || '-',
                        entries: 0,
                        minutes: 0,
                        ready: 0,
                        missing: 0,
                        reviewed: 0,
                        lastDate: ''
                    });
                }
                const person = personMap.get(pKey);
                person.entries += 1;
                person.minutes += minutes;
                person.lastDate = String(d.date || '') > String(person.lastDate || '') ? d.date : person.lastDate;
                if(statusInfo.code === 'Siap') person.ready += 1;
                if(statusInfo.code === 'Kurang') person.missing += 1;
                if(statusInfo.code === 'Review') person.reviewed += 1;
            });

            const personRows = Array.from(personMap.values()).sort((a, b) => b.minutes - a.minutes || b.entries - a.entries || a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
            const labRows = Object.entries(labHours).sort((a, b) => b[1] - a[1]);
            const readiness = rows.length ? Math.round(((readyRows + reviewedRows) / rows.length) * 100) : 0;
            const topPerson = personRows[0] || null;
            const topLab = labRows[0] || null;

            return {
                totalEntries: rows.length,
                totalMinutes,
                totalHours: Math.round((totalMinutes / 60) * 10) / 10,
                personRows,
                labRows,
                statusCounts,
                readyRows,
                missingRows,
                reviewedRows,
                readiness,
                topPerson,
                topLab
            };
        }

        function formatOvertimeHours(minutes) {
            const hours = Math.round((Number(minutes || 0) / 60) * 10) / 10;
            return `${hours}`;
        }

        function renderOvertimeStatusBadge(statusInfo) {
            return `<span class="admin-overtime-status-badge ${statusInfo.className}">${escapeHTML(statusInfo.label)}</span>`;
        }

        function getOvertimeMarkerDiagnostics() {
            const allRows = getRoleScopedJurnalRows();
            const markerKeys = {};
            let markedCount = 0;
            allRows.forEach(row => {
                const info = getExplicitLemburFlagFromRow(row?._rawRow || row);
                if(info && info.found) {
                    const key = String(info.key || 'penanda').trim() || 'penanda';
                    markerKeys[key] = (markerKeys[key] || 0) + 1;
                    if(isTruthyLemburValue(info.value)) markedCount += 1;
                } else if(isTruthyLemburValue(row?.isLembur)) {
                    markerKeys.isLembur = (markerKeys.isLembur || 0) + 1;
                    markedCount += 1;
                }
            });
            return { totalRows: allRows.length, markedCount, markerKeys };
        }

        function updateOvertimeDiagnostic(filters, filteredRows, allOvertimeRows) {
            const el = document.getElementById('admin-overtime-diagnostic');
            if(!el) return;
            const diag = getOvertimeMarkerDiagnostics();
            const keyText = Object.keys(diag.markerKeys).length
                ? Object.entries(diag.markerKeys).map(([k, v]) => `${k}: ${v}`).join(' • ')
                : 'kolom penanda belum terbaca';
            const filterText = [
                filters?.monthVal ? `bulan ${filters.monthVal}` : 'semua bulan',
                filters?.labSelect && filters.labSelect !== 'Semua' ? `fungsi ${filters.labSelect}` : 'semua fungsi',
                filters?.statusSelect && filters.statusSelect !== 'Semua' ? `status ${filters.statusSelect}` : 'semua status'
            ].join(' • ');

            if(diag.markedCount > 0) {
                el.className = 'rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-[10px] font-bold text-emerald-800 uppercase tracking-wider leading-relaxed';
                el.innerHTML = `Terbaca <b>${diag.totalRows}</b> jurnal. Jurnal bertanda lembur: <b>${diag.markedCount}</b>. Tampil sesuai filter: <b>${filteredRows?.length || 0}</b>. Filter: ${escapeHTML(filterText)}. Penanda: ${escapeHTML(keyText)}.`;
            } else if(diag.totalRows > 0) {
                el.className = 'rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-[10px] font-bold text-amber-800 uppercase tracking-wider leading-relaxed';
                el.innerHTML = `Terbaca <b>${diag.totalRows}</b> jurnal, tetapi belum ada nilai penanda lembur yang TRUE/YA. Pastikan kolom <b>Lembur?</b> di Sheet Jurnal bernilai TRUE/Ya untuk kegiatan lembur. Penanda terbaca: ${escapeHTML(keyText)}.`;
            } else {
                el.className = 'rounded-2xl border border-rose-100 bg-rose-50/90 px-4 py-3 text-[10px] font-bold text-rose-700 uppercase tracking-wider leading-relaxed';
                el.innerHTML = 'Belum ada data jurnal terbaca. Klik <b>Sinkron Lembur</b>, lalu pastikan Apps Script sudah deploy versi terbaru dan URL SCRIPT_URL masih aktif.';
            }
        }

        window.forceReloadOvertimeData = async function() {
            if(!canAccessAdminPanel()) return;
            window.showLoader && window.showLoader(true, 'Mengambil ulang data lembur dari Google Sheet...');
            try {
                window.__ARIKA_OT_LIVE_RETRY = false;
                clearLocalCoreCache();
                if(typeof window.fetchLiveJurnalFromSheet === 'function') {
                    await window.fetchLiveJurnalFromSheet({ silent: false, timeoutMs: 25000 });
                } else if(typeof window.fetchCloudData === 'function') {
                    await window.fetchCloudData({ force: true, full: true });
                }
                window.renderAdminOvertimeDashboard({ fromDataRefresh: true });
            } catch(err) {
                console.warn('Sinkron lembur manual gagal:', err);
                window.showCustomAlert && window.showCustomAlert('Sinkron ulang lembur gagal: ' + err.message);
            } finally {
                window.showLoader && window.showLoader(false);
            }
        };

        window.setAdminOvertimePage = function(page) {
            window.adminOvertimePage = Number(page) || 1;
            window.renderAdminOvertimeDashboard({ keepPage: true });
        };

        window.renderAdminOvertimeDashboard = function(options = {}) {
            if(!canAccessAdminPanel()) return;
            populateAdminOvertimeLabOptions();
            const { rows, filters } = getAdminOvertimeRows();
            const overtimeSignature = `${filters.monthVal}|${filters.labSelect}|${filters.statusSelect}|${filters.searchText}|${getRoleScopedJurnalRows().length}`;
            if(!options.keepPage && window.adminOvertimeSignature !== overtimeSignature) {
                window.adminOvertimePage = 1;
                window.adminOvertimeSignature = overtimeSignature;
            }
            const stats = buildAdminOvertimeStats(rows);
            const allOvertimeRows = getRoleScopedJurnalRows().filter(d => isAdminOvertimeRow(d));
            updateOvertimeDiagnostic(filters, rows, allOvertimeRows);

            // Jika cache lama belum membawa penanda Lembur?, ambil ulang jurnal live satu kali dari Google Sheet.
            if(!allOvertimeRows.length && !options.fromDataRefresh && !window.__ARIKA_OT_LIVE_RETRY && typeof window.fetchLiveJurnalFromSheet === 'function') {
                window.__ARIKA_OT_LIVE_RETRY = true;
                window.fetchLiveJurnalFromSheet({ silent: true, timeoutMs: 15000 }).then(ok => {
                    if(ok) window.renderAdminOvertimeDashboard({ fromDataRefresh: true });
                }).catch(err => console.warn('Retry live dashboard lembur gagal:', err));
            }

            setText('admin-ot-total', String(stats.totalEntries));
            setText('admin-ot-hours', String(stats.totalHours));
            setText('admin-ot-people', String(stats.personRows.length));
            setText('admin-ot-ready', `${stats.readiness}%`);
            setText('admin-ot-missing', String(stats.missingRows));
            setText('admin-ot-complete-text', `${stats.readiness}%`);
            setText('admin-ot-complete-note', stats.totalEntries ? `${stats.readyRows + stats.reviewedRows} dari ${stats.totalEntries} laporan siap diverifikasi atau sudah direview.` : 'Belum ada data lembur pada filter ini.');

            const bar = document.getElementById('admin-ot-complete-bar');
            if(bar) bar.style.setProperty('--progress', `${stats.readiness}%`);

            setText('admin-ot-top-person', stats.topPerson ? stats.topPerson.name : '-');
            setText('admin-ot-top-person-note', stats.topPerson ? `${stats.topPerson.entries} entri • ${formatOvertimeHours(stats.topPerson.minutes)} jam • ${stats.topPerson.lab || '-'}` : 'Belum ada data.');
            setText('admin-ot-top-lab', stats.topLab ? stats.topLab[0] : '-');
            setText('admin-ot-top-lab-note', stats.topLab ? `${formatOvertimeHours(stats.topLab[1])} jam lembur pada fungsi/lab ini.` : 'Belum ada data.');
            setText('admin-ot-person-count', `${stats.personRows.length} Personil`);
            setText('admin-ot-row-count', `${stats.totalEntries} Data${filters.monthVal ? '' : ' • Semua Bulan'}`);

            const labLabels = stats.labRows.slice(0, 8).map(item => item[0]);
            renderChart('admin-chart-overtime-lab', 'adminChartOvertimeLab', 'bar', labLabels, [
                { label: 'Jam Lembur', data: stats.labRows.slice(0, 8).map(item => Math.round((item[1] / 60) * 10) / 10) }
            ], {
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: value => `${value} jam` }, grid: { color: 'rgba(148,163,184,.16)' } },
                    x: { grid: { display: false } }
                }
            });

            const statusLabels = Object.keys(stats.statusCounts).filter(k => stats.statusCounts[k] > 0);
            renderChart('admin-chart-overtime-status', 'adminChartOvertimeStatus', 'doughnut', statusLabels.length ? statusLabels : ['Belum Ada Data'], [
                { data: statusLabels.length ? statusLabels.map(k => stats.statusCounts[k]) : [1] }
            ], { cutout: '70%' });

            const personBody = document.getElementById('admin-ot-person-body');
            if(personBody) {
                personBody.innerHTML = stats.personRows.length ? stats.personRows.slice(0, 12).map((p, i) => `
                    <tr class="hover:bg-slate-50">
                        <td>
                            <div class="font-black text-slate-900 uppercase leading-snug">${i + 1}. ${escapeHTML(p.name)}</div>
                            <div class="mt-1 text-[9px] font-bold text-slate-400 uppercase">${escapeHTML(p.lab || '-')}${p.nip ? ' • ' + escapeHTML(p.nip) : ''}</div>
                        </td>
                        <td class="text-center font-black text-cyan-700">${p.entries}</td>
                        <td class="text-center font-black text-amber-700">${formatOvertimeHours(p.minutes)}</td>
                    </tr>
                `).join('') : `<tr><td colspan="3" class="p-6 text-center text-slate-400 italic font-black uppercase text-[9px]">${allOvertimeRows.length ? 'Tidak ada personil lembur sesuai filter ini' : 'Belum ada jurnal yang diberi tanda lembur'}</td></tr>`;
            }

            const detailBody = document.getElementById('admin-ot-detail-body');
            const detailPagination = document.getElementById('admin-ot-detail-pagination');
            if(detailBody) {
                const pageSize = 10;
                const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
                window.adminOvertimePage = Math.max(1, Math.min(Number(window.adminOvertimePage) || 1, totalPages));
                const startIndex = (window.adminOvertimePage - 1) * pageSize;
                const pageRows = rows.slice(startIndex, startIndex + pageSize);

                detailBody.innerHTML = rows.length ? pageRows.map(d => {
                    const statusInfo = getAdminOvertimeRowStatus(d);
                    const missingText = statusInfo.missing.length ? `<div class="mt-1 text-[9px] font-black text-rose-500 uppercase">Kurang: ${escapeHTML(statusInfo.missing.join(', '))}</div>` : '';
                    const suratText = d.suratTugas ? `<div class="mt-1 text-[9px] font-bold text-slate-400 uppercase">ST: ${escapeHTML(d.suratTugas)}</div>` : '';
                    return `
                        <tr class="hover:bg-slate-50">
                            <td class="font-mono text-[9px] text-slate-500">${escapeHTML(formatHariTanggal(d.date))}</td>
                            <td>
                                <div class="font-black text-slate-900 uppercase leading-snug">${escapeHTML(d.name || '-')}</div>
                                <div class="mt-1 text-[9px] font-bold text-slate-400 uppercase">${escapeHTML(d.lab || '-')}${d.nip ? ' • ' + escapeHTML(d.nip) : ''}</div>
                            </td>
                            <td class="max-w-[330px]">
                                <div class="font-bold text-slate-700 leading-relaxed">${escapeHTML(d.desc || '-')}</div>
                                <div class="flex flex-wrap gap-1 mt-1">${renderDataDukungLink(d.linkDataDukung, 'Data Dukung')}</div>
                                ${suratText}${missingText}
                            </td>
                            <td class="text-center">
                                <div class="font-black text-amber-700">${formatDurasi(d.start, d.end, d.lamaLembur)}</div>
                                <div class="text-[9px] text-slate-400 font-bold">${escapeHTML(d.start || '-')} - ${escapeHTML(d.end || '-')}</div>
                            </td>
                            <td class="text-center">${renderOvertimeStatusBadge(statusInfo)}</td>
                            <td class="text-center">
                                <button onclick="window.openJurnalReviewModal('${escapeHTML(d.id)}')" class="px-2 py-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-600 text-cyan-700 hover:text-white text-[8px] font-black uppercase tracking-widest transition-colors">💬 Review</button>
                            </td>
                        </tr>
                    `;
                }).join('') : `<tr><td colspan="6" class="p-8 text-center text-slate-400 italic font-black uppercase text-[9px]">${allOvertimeRows.length ? 'Data lembur ada, tetapi tidak sesuai filter bulan/fungsi/status/pencarian' : 'Belum ada data lembur terbaca. Pastikan jurnal memiliki kolom penanda Lembur? / Kegiatan Lembur bernilai TRUE, Ya, Iya, 1, atau Lembur. Data dari jam/surat tugas tidak dihitung jika tanda lembur kosong.'}</td></tr>`;

                if(detailPagination) {
                    detailPagination.innerHTML = buildHistoryPaginationHtml(window.adminOvertimePage, totalPages, rows.length, 'window.setAdminOvertimePage');
                    detailPagination.classList.toggle('hidden', rows.length <= pageSize);
                }
            }
        };

        window.downloadAdminOvertimeExcel = function() {
            if(!canAccessAdminPanel()) return window.showCustomAlert('Akses admin/verifikator diperlukan.');
            const { rows, filters } = getAdminOvertimeRows();
            const stats = buildAdminOvertimeStats(rows);
            let html = `<table border="1"><tr><th colspan="9">REKAP PENGELOLAAN LEMBUR ARIKA - ${escapeHTML(formatBulanIndonesia(filters.monthVal))}</th></tr>`;
            html += `<tr><th>Total Entri</th><th>Total Jam</th><th>Personil</th><th>Siap/Review</th><th>Perlu Lengkapi</th><th colspan="4">Filter</th></tr>`;
            html += `<tr><td>${stats.totalEntries}</td><td>${stats.totalHours}</td><td>${stats.personRows.length}</td><td>${stats.readyRows + stats.reviewedRows}</td><td>${stats.missingRows}</td><td colspan="4">${escapeHTML(filters.labSelect)} / ${escapeHTML(filters.statusSelect)}</td></tr>`;
            html += `<tr><th>Tanggal</th><th>Nama</th><th>NIP</th><th>Fungsi/Lab</th><th>Uraian</th><th>Jam Mulai</th><th>Jam Selesai</th><th>Durasi</th><th>Status Verifikasi</th></tr>`;
            rows.forEach(d => {
                const statusInfo = getAdminOvertimeRowStatus(d);
                html += `<tr><td>${escapeHTML(d.date)}</td><td>${escapeHTML(d.name)}</td><td>${escapeHTML(d.nip)}</td><td>${escapeHTML(d.lab)}</td><td>${escapeHTML(d.desc)}</td><td>${escapeHTML(d.start)}</td><td>${escapeHTML(d.end)}</td><td>${escapeHTML(formatDurasi(d.start, d.end, d.lamaLembur))}</td><td>${escapeHTML(statusInfo.label + (statusInfo.missing.length ? ' - Kurang: ' + statusInfo.missing.join(', ') : ''))}</td></tr>`;
            });
            html += `</table><br><table border="1"><tr><th colspan="5">REKAP PER PERSONIL</th></tr><tr><th>No</th><th>Nama</th><th>Fungsi/Lab</th><th>Entri</th><th>Jam</th></tr>`;
            stats.personRows.forEach((p, i) => html += `<tr><td>${i + 1}</td><td>${escapeHTML(p.name)}</td><td>${escapeHTML(p.lab)}</td><td>${p.entries}</td><td>${formatOvertimeHours(p.minutes)}</td></tr>`);
            html += `</table>`;
            downloadXls(`dashboard-pengelolaan-lembur-${filters.monthVal || 'periode'}.xls`, html);
        };

        window.downloadAdminOvertimeReportWord = function() {
            if(!canAccessAdminPanel()) return window.showCustomAlert('Akses admin/verifikator diperlukan.');
            const { rows, filters } = getAdminOvertimeRows();
            const stats = buildAdminOvertimeStats(rows);
            const monthLabel = formatBulanIndonesia(filters.monthVal);
            const topPersonText = stats.topPerson ? `${escapeHTML(stats.topPerson.name)} (${stats.topPerson.entries} entri, ${formatOvertimeHours(stats.topPerson.minutes)} jam)` : 'Belum ada data';
            const topLabText = stats.topLab ? `${escapeHTML(stats.topLab[0])} (${formatOvertimeHours(stats.topLab[1])} jam)` : 'Belum ada data';
            const personRows = stats.personRows.map((p, i) => `<tr><td class="center">${i + 1}</td><td>${escapeHTML(p.name)}</td><td>${escapeHTML(p.lab)}</td><td class="center">${p.entries}</td><td class="center">${formatOvertimeHours(p.minutes)}</td><td class="center">${p.missing}</td></tr>`).join('') || '<tr><td colspan="6" class="center">Belum ada data</td></tr>';
            const html = `
                <div class="center bold" style="font-size:14pt;">LAPORAN DASHBOARD PENGELOLAAN LEMBUR PERSONIL</div>
                <div class="center" style="margin-bottom:18px;">Periode: ${escapeHTML(monthLabel)}${filters.labSelect !== 'Semua' ? ' • ' + escapeHTML(filters.labSelect) : ''}</div>
                <p><b>Ringkasan:</b> Terdapat ${stats.totalEntries} entri lembur dari ${stats.personRows.length} personil dengan estimasi total ${stats.totalHours} jam lembur.</p>
                <p><b>Kelengkapan:</b> ${stats.readyRows + stats.reviewedRows} laporan siap diverifikasi/sudah direview, sedangkan ${stats.missingRows} laporan masih memerlukan kelengkapan surat tugas, jam lembur, atau data dukung.</p>
                <p><b>Personil tertinggi:</b> ${topPersonText}. <b>Fungsi/lab dominan:</b> ${topLabText}.</p>
                <h3>Rekap Per Personil</h3>
                <table><tr><th>No</th><th>Nama</th><th>Fungsi/Lab</th><th>Entri</th><th>Jam</th><th>Perlu Lengkapi</th></tr>${personRows}</table>
                <p style="margin-top:24px;">Catatan: Laporan ini dihasilkan otomatis dari ARIKA dan digunakan sebagai bahan monitoring, verifikasi, serta tindak lanjut pengelolaan lembur.</p>
            `;
            downloadWord(`laporan-dashboard-lembur-${filters.monthVal || 'periode'}.doc`, html);
        };

        window.downloadAdminMonthlyReportWord = function() {
            if(!canAccessAdminPanel()) return window.showCustomAlert('Akses admin/verifikator diperlukan.');
            const stats = getAdminAnalyticsStats();
            const monthLabel = formatBulanIndonesia(stats.monthVal);
            const jamLembur = Math.round((stats.totalMinutes / 60) * 10) / 10;
            const topRows = getTopContributors(stats.rows).map((p, i) => `<tr><td class="center">${i + 1}</td><td>${escapeHTML(p.name)}</td><td class="center">${p.score}</td><td class="center">${p.total}</td><td class="center">${p.days?.size || 0}</td><td class="center">${p.lembur}</td></tr>`).join('') || '<tr><td colspan="6" class="center">Belum ada data</td></tr>';
            const monevRows = buildMonevRows(stats).map(row => `<tr><td>${escapeHTML(row.indikator)}</td><td>${escapeHTML(row.kondisi)}</td><td>${escapeHTML(row.evaluasi)}</td><td>${escapeHTML(row.rekomendasi)}</td></tr>`).join('');
            const html = `
                <div class="center bold" style="font-size:14pt;">LAPORAN BULANAN DAN MONITORING EVALUASI ARIKA</div>
                <div class="center" style="margin-bottom:18px;">Periode: ${escapeHTML(monthLabel)}${stats.labSelect !== 'Semua' ? ' • ' + escapeHTML(stats.labSelect) : ''}</div>
                <p><b>Ringkasan:</b> ARIKA mencatat ${stats.rows.length} entri aktivitas dari ${stats.activeNames.size} pegawai aktif. Tingkat ketuntasan pekerjaan adalah ${stats.completionRate}% dengan ${stats.selesaiCount} kegiatan selesai dan ${stats.belumCount} kegiatan belum selesai.</p>
                <p><b>Lembur:</b> Terdapat ${stats.lemburRows.length} entri lembur dengan estimasi total ${jamLembur} jam. Fungsi/lab paling aktif adalah ${escapeHTML(stats.topLab[0])}, dan kategori kegiatan terbanyak adalah ${escapeHTML(stats.topCat[0])}.</p>
                <h3>Top Kontributor</h3>
                <table><tr><th>No</th><th>Nama Pegawai</th><th>Skor</th><th>Total Entri</th><th>Hari Aktif</th><th>Entri Lembur</th></tr>${topRows}</table>
                <h3>Monitoring Evaluasi</h3>
                <table><tr><th>Indikator</th><th>Kondisi</th><th>Evaluasi</th><th>Rekomendasi</th></tr>${monevRows}</table>
                <p style="margin-top:24px;">Catatan: Laporan ini dihasilkan otomatis dari data ARIKA dan dapat digunakan sebagai bahan monitoring internal, evaluasi pengisian jurnal, serta persiapan tindak lanjut bulanan.</p>
            `;
            downloadWord(`Laporan-Bulanan-Monev-ARIKA-${stats.monthVal || 'periode'}.doc`, html);
        };

        window.downloadAdminMonevExcel = function() {
            if(!canAccessAdminPanel()) return window.showCustomAlert('Akses admin/verifikator diperlukan.');
            const stats = getAdminAnalyticsStats();
            const monevRows = buildMonevRows(stats);
            let html = `<table border="1"><tr><th colspan="4">MONITORING EVALUASI ARIKA - ${escapeHTML(formatBulanIndonesia(stats.monthVal))}</th></tr><tr><th>Indikator</th><th>Kondisi</th><th>Evaluasi</th><th>Rekomendasi</th></tr>`;
            monevRows.forEach(row => html += `<tr><td>${escapeHTML(row.indikator)}</td><td>${escapeHTML(row.kondisi)}</td><td>${escapeHTML(row.evaluasi)}</td><td>${escapeHTML(row.rekomendasi)}</td></tr>`);
            html += `</table><br><table border="1"><tr><th colspan="6">TOP KONTRIBUTOR</th></tr><tr><th>No</th><th>Nama</th><th>Skor</th><th>Total Entri</th><th>Hari Aktif</th><th>Entri Lembur</th></tr>`;
            getTopContributors(stats.rows).forEach((p, i) => html += `<tr><td>${i + 1}</td><td>${escapeHTML(p.name)}</td><td>${p.score}</td><td>${p.total}</td><td>${p.days?.size || 0}</td><td>${p.lembur}</td></tr>`);
            html += '</table>';
            downloadXls(`monev-arika-${stats.monthVal || 'periode'}.xls`, html);
        };

        function getFirstNameForSort(name) {
            return String(name || '').trim().split(/\s+/)[0] || '';
        }

        function getRowInputTimeValue(row) {
            const inputAt = String(row?.inputAt || '').trim();
            const parsedInput = inputAt ? new Date(inputAt).getTime() : NaN;
            if(Number.isFinite(parsedInput)) return parsedInput;

            const dateVal = String(row?.date || '').trim();
            const parsedDate = dateVal ? new Date(dateVal + 'T00:00:00').getTime() : NaN;
            return Number.isFinite(parsedDate) ? parsedDate : 0;
        }

        function sortAdminAllRows(rows) {
            return [...(rows || [])].sort((a, b) => {
                // Urutan utama: tanggal kegiatan/input terbaru di atas.
                const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
                if(dateCompare !== 0) return dateCompare;

                // Dalam tanggal yang sama: rapi menurut abjad nama depan.
                const firstCompare = getFirstNameForSort(a.name).localeCompare(getFirstNameForSort(b.name), 'id', { sensitivity: 'base' });
                if(firstCompare !== 0) return firstCompare;

                const fullNameCompare = String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' });
                if(fullNameCompare !== 0) return fullNameCompare;

                // Jika nama sama, gunakan waktu input terbaru sebagai pengikat akhir.
                return getRowInputTimeValue(b) - getRowInputTimeValue(a);
            });
        }

        window.setAdminAllPage = function(page) {
            window.adminAllPage = Number(page) || 1;
            window.renderAdminAllTable({ keepPage: true });
        };

        window.renderAdminAllTable = function(options = {}) {
            lockSelectToVerifierUnit('admin-filter-lab');
            const tbody = document.getElementById('admin-all-body');
            const pagination = document.getElementById('admin-all-pagination');
            if(!tbody) return;

            tbody.innerHTML = '';

            const { start: rangeStart, end: rangeEnd } = getDateRangeValues('admin-filter-start', 'admin-filter-end');
            const labSelect = document.getElementById('admin-filter-lab')?.value || 'Semua';
            const statusSelect = document.getElementById('admin-filter-status')?.value || 'Semua';
            const typeSelect = document.getElementById('admin-filter-type')?.value || 'Semua';
            const signature = `${rangeStart}|${rangeEnd}|${labSelect}|${statusSelect}|${typeSelect}|${getRoleScopedJurnalRows().length}`;

            if(!options.keepPage && window.adminAllSignature !== signature) {
                window.adminAllPage = 1;
                window.adminAllSignature = signature;
            }

            const globalData = sortAdminAllRows(getRoleScopedJurnalRows().filter(d => {
                const matchesRange = dateInRange(d.date, rangeStart, rangeEnd);
                const matchesLab = labMatches(d.lab, labSelect);
                const matchesStatus = statusSelect === 'Semua' || normalize(d.statusPegawai) === normalize(statusSelect);
                let matchesType = true;
                if(typeSelect === 'Lembur') matchesType = d.isLembur;
                if(typeSelect === 'Biasa') matchesType = !d.isLembur;
                return matchesRange && matchesLab && matchesStatus && matchesType;
            }));

            if(globalData.length === 0) {
                const rawTotal = getRoleScopedJurnalRows().length;
                const msg = rawTotal === 0
                    ? 'Data jurnal belum terbaca. Klik Sinkron Sheet / refresh ARIKA.'
                    : 'Data jurnal sudah terbaca, tetapi tidak cocok dengan filter rentang/fungsi/status/jenis saat ini. Klik Semua Waktu atau pilih Semua Lab.';
                tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 italic text-xs">${msg}</td></tr>`;
                if(pagination) {
                    pagination.classList.add('hidden');
                    pagination.innerHTML = '';
                }
                return;
            }

            const totalPages = Math.max(1, Math.ceil(globalData.length / ARIKA_HISTORY_PAGE_SIZE));
            window.adminAllPage = Math.max(1, Math.min(Number(window.adminAllPage) || 1, totalPages));
            const startIndex = (window.adminAllPage - 1) * ARIKA_HISTORY_PAGE_SIZE;
            const pageRows = globalData.slice(startIndex, startIndex + ARIKA_HISTORY_PAGE_SIZE);

            tbody.innerHTML = pageRows.map(d => {
                const badgeColor = d.status === 'Selesai' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600';
                const typeBadge = d.isLembur
                    ? '<span class="ml-2 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase">Lembur</span>'
                    : '';
                return `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-4 font-mono text-[10px]">${escapeHTML(formatHariTanggal(d.date))}</td>
                        <td class="p-4 font-extrabold text-slate-900 uppercase text-[10px]">${escapeHTML(d.name)}</td>
                        <td class="p-4 font-semibold text-emerald-600 text-[10px]">${escapeHTML(d.lab || '-')}</td>
                        <td class="p-4 text-[10px] uppercase">${escapeHTML(d.desc)}${typeBadge}</td>
                        <td class="p-4 text-center">
                            <div class="flex flex-col items-center gap-2">
                                <span class="px-2 py-1 rounded-full text-[8px] font-black uppercase ${badgeColor}">${escapeHTML(d.status)}</span>
                                ${hasJurnalReview(d) ? `<span class="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[8px] font-black uppercase">Ada Catatan</span>` : ''}
                                <button onclick="window.openJurnalReviewModal('${escapeHTML(d.id)}')" class="px-2 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-600 text-cyan-700 hover:text-white text-[8px] font-black uppercase tracking-widest transition-colors">💬 Review</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            if(pagination) {
                pagination.innerHTML = buildHistoryPaginationHtml(window.adminAllPage, totalPages, globalData.length, 'window.setAdminAllPage');
                pagination.classList.toggle('hidden', globalData.length <= ARIKA_HISTORY_PAGE_SIZE);
            }
        };

        // --- HELPER KEAMANAN OUTPUT & EXPORT ---
        function escapeHTML(value) {
            return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        }



        function escapeHTMLPreserveLines(value) {
            return escapeHTML(value)
                .replaceAll('\\r\\n', '\n')
                .replaceAll('\\n', '\n')
                .replaceAll('\\r', '\n');
        }

        function linkifyText(value) {
            const escaped = escapeHTML(value || '');
            const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
            return escaped.replace(urlRegex, (match) => {
                const trailingMatch = match.match(/([.,;:!?\)]*)$/);
                const trailing = trailingMatch ? trailingMatch[1] : '';
                const cleanUrl = trailing ? match.slice(0, -trailing.length) : match;
                if(!cleanUrl) return match;
                const href = cleanUrl.toLowerCase().startsWith('www.') ? `https://${cleanUrl}` : cleanUrl;
                return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="arika-inline-link" onclick="event.stopPropagation()">${cleanUrl}</a>${trailing}`;
            });
        }

        function makeLocalId(prefix = 'id') {
            return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        }

        function findPegawaiByName(name) {
            return window.masterPegawai.find(p => normalize(p.nama) === normalize(name)) || null;
        }

        function getCurrentMonth() {
            return new Date().toISOString().slice(0, 7);
        }

        function addDaysToKey(dateKey, days) {
            const [y, m, d] = dateKey.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            dt.setDate(dt.getDate() + days);
            return dt.toLocaleDateString('en-CA');
        }

        function getDateRangeValues(startId, endId) {
            let start = document.getElementById(startId)?.value || '';
            let end = document.getElementById(endId)?.value || '';
            if(start && end && start > end) {
                const temp = start;
                start = end;
                end = temp;
            }
            return { start, end };
        }

        function dateInRange(dateValue, start, end) {
            const dateKey = String(dateValue || '').slice(0, 10);
            if(!dateKey) return false;
            if(start && dateKey < start) return false;
            if(end && dateKey > end) return false;
            return true;
        }

        function setRangeToToday(startId, endId, callbackName) {
            const today = getTodayKey();
            const startEl = document.getElementById(startId);
            const endEl = document.getElementById(endId);
            if(startEl) startEl.value = today;
            if(endEl) endEl.value = today;
            if(callbackName && typeof window[callbackName] === 'function') window[callbackName]();
            if(startId === 'filter-rekap-start' && typeof window.renderVisualCalendar === 'function') window.renderVisualCalendar();
        }

        function setRangeToCurrentWeek(startId, endId, callbackName) {
            const now = new Date();
            const day = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - ((day + 6) % 7));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            const startEl = document.getElementById(startId);
            const endEl = document.getElementById(endId);
            if(startEl) startEl.value = monday.toLocaleDateString('en-CA');
            if(endEl) endEl.value = sunday.toLocaleDateString('en-CA');
            if(callbackName && typeof window[callbackName] === 'function') window[callbackName]();
            if(startId === 'filter-rekap-start' && typeof window.renderVisualCalendar === 'function') window.renderVisualCalendar();
        }

        function setRangeToCurrentMonth(startId, endId, callbackName) {
            const today = getTodayKey();
            const month = today.slice(0, 7);
            const [year, mon] = month.split('-').map(Number);
            const last = new Date(year, mon, 0).getDate();
            const startEl = document.getElementById(startId);
            const endEl = document.getElementById(endId);
            if(startEl) startEl.value = `${month}-01`;
            if(endEl) endEl.value = `${month}-${String(last).padStart(2, '0')}`;
            if(callbackName && typeof window[callbackName] === 'function') window[callbackName]();
            if(startId === 'filter-rekap-start' && typeof window.renderVisualCalendar === 'function') window.renderVisualCalendar();
        }

        function clearDateRange(startId, endId, callbackName) {
            const startEl = document.getElementById(startId);
            const endEl = document.getElementById(endId);
            if(startEl) startEl.value = '';
            if(endEl) endEl.value = '';
            if(callbackName && typeof window[callbackName] === 'function') window[callbackName]();
            if(startId === 'filter-rekap-start' && typeof window.renderVisualCalendar === 'function') window.renderVisualCalendar();
        }

        function loadLocalPengumuman() {
            try {
                return JSON.parse(localStorage.getItem('arika_pengumuman') || '[]');
            } catch (_) {
                return [];
            }
        }

        function saveLocalPengumuman(list) {
            try {
                localStorage.setItem('arika_pengumuman', JSON.stringify(list || []));
            } catch (_) {}
        }

        const ARIKA_RENCANA_LOCAL_KEY = 'arika_rencana_pribadi_v2';
        const ARIKA_RENCANA_OLD_LOCAL_KEY = 'arika_rencana_pribadi';

        const ARIKA_DELETED_RENCANA_TOMBSTONE_KEY = 'arika_deleted_rencana_tombstones_v1';
        const ARIKA_DELETED_RENCANA_TOMBSTONE_MAX_AGE = 30 * 60 * 1000;

        function loadLocalRencana() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ARIKA_RENCANA_LOCAL_KEY) || '[]');
                return applyRencanaDeleteTombstones(parsed);
            } catch (_) {
                return [];
            }
        }

        function saveLocalRencana(list) {
            try {
                const safeList = applyRencanaDeleteTombstones(list || []);
                localStorage.setItem(ARIKA_RENCANA_LOCAL_KEY, JSON.stringify(safeList));
                localStorage.removeItem(ARIKA_RENCANA_OLD_LOCAL_KEY);
            } catch (_) {}
        }

        function isRecentPendingLocalRencana(item) {
            if(!item || normalize(item.syncStatus || '') !== 'pending') return false;
            const created = Date.parse(item.createdAt || '');
            if(!Number.isFinite(created)) return false;
            return Date.now() - created < 30 * 60 * 1000;
        }

        function applyCloudRencanaData(mappedList) {
            const cloudList = applyRencanaDeleteTombstones(dedupeRencanaList(mappedList || []).map(item => ({ ...item, syncStatus: 'synced' })));
            const cloudKeys = new Set(cloudList.map(getRencanaKey));
            const pendingLocal = loadLocalRencana().filter(item => isRecentPendingLocalRencana(item) && !cloudKeys.has(getRencanaKey(item)));
            const finalList = applyRencanaDeleteTombstones(dedupeRencanaList([...cloudList, ...pendingLocal]));
            window.rencanaData = finalList;
            saveLocalRencana(finalList);
            return finalList;
        }

        function getRencanaKey(item) {
            return [
                normalize(item.ownerNip || item.ownerName || ''),
                String(item.tanggal || ''),
                normalize(getRencanaJamReminder(item)),
                normalize(item.periode || 'Reminder'),
                normalize(item.judul || ''),
                normalize(item.catatan || ''),
                normalize(item.status || 'Aktif')
            ].join('|');
        }

        function readRencanaDeleteTombstones() {
            let map = {};
            try {
                map = JSON.parse(localStorage.getItem(ARIKA_DELETED_RENCANA_TOMBSTONE_KEY) || '{}') || {};
            } catch(_) {
                map = {};
            }
            const now = Date.now();
            let changed = false;
            Object.keys(map).forEach(key => {
                if(!map[key] || (now - Number(map[key])) > ARIKA_DELETED_RENCANA_TOMBSTONE_MAX_AGE) {
                    delete map[key];
                    changed = true;
                }
            });
            if(changed) {
                try { localStorage.setItem(ARIKA_DELETED_RENCANA_TOMBSTONE_KEY, JSON.stringify(map)); } catch(_) {}
            }
            return map;
        }

        function writeRencanaDeleteTombstones(map) {
            try { localStorage.setItem(ARIKA_DELETED_RENCANA_TOMBSTONE_KEY, JSON.stringify(map || {})); } catch(_) {}
        }

        function buildRencanaDeleteKeys(item = {}) {
            const keys = [];
            const id = String(item.id || '').trim();
            if(id) keys.push('id:' + id);
            keys.push('content:' + getRencanaKey(item));
            keys.push([
                'soft',
                normalize(item.ownerNip || item.ownerName || ''),
                String(item.tanggal || ''),
                normalize(getRencanaJamReminder(item)),
                normalize(item.judul || ''),
                normalize(item.catatan || '')
            ].join('|'));
            return keys.filter(Boolean);
        }

        function markRencanaAsLocallyDeleted(item = {}) {
            const map = readRencanaDeleteTombstones();
            const now = Date.now();
            buildRencanaDeleteKeys(item).forEach(key => { map[key] = now; });
            writeRencanaDeleteTombstones(map);
        }

        function isRencanaLocallyDeleted(item = {}) {
            const map = readRencanaDeleteTombstones();
            return buildRencanaDeleteKeys(item).some(key => !!map[key]);
        }

        function applyRencanaDeleteTombstones(list = []) {
            return (list || []).filter(item => !isRencanaLocallyDeleted(item));
        }

        function rencanaMatchesDeleteTarget(row = {}, target = {}) {
            const targetId = String(target.id || '').trim();
            if(targetId && String(row.id || '').trim() === targetId) return true;
            return buildRencanaDeleteKeys(row).some(key => buildRencanaDeleteKeys(target).includes(key));
        }

        function dedupeRencanaList(list) {
            const seenById = new Set();
            const seenByContent = new Set();
            const result = [];
            (list || []).forEach(item => {
                if(!item) return;
                const id = String(item.id || '').trim();
                if(id && seenById.has(id)) return;
                const contentKey = getRencanaKey(item);
                if(seenByContent.has(contentKey)) return;
                if(id) seenById.add(id);
                seenByContent.add(contentKey);
                result.push(item);
            });
            return result;
        }

        // v162: Rencana Saya tidak boleh hilang saat reload atau saat Google Sheet lambat/kosong.
        function getStableRencanaData(extraList = []) {
            const liveList = Array.isArray(window.rencanaData) ? window.rencanaData : [];
            const localList = (() => {
                try { return loadLocalRencana(); } catch(e) { return []; }
            })();
            const coreCacheList = (() => {
                try {
                    const cache = loadLocalCoreCache({ allowStale: true });
                    return cache?.rencanaCloudAuthority === true && Array.isArray(cache?.rencana) ? cache.rencana : [];
                } catch(e) { return []; }
            })();
            return applyRencanaDeleteTombstones(dedupeRencanaList([...(extraList || []), ...liveList, ...localList, ...coreCacheList]));
        }

        function saveStableRencanaData(list) {
            const stable = applyRencanaDeleteTombstones(dedupeRencanaList(list || []));
            if(stable.length > 0) {
                window.rencanaData = stable;
                saveLocalRencana(stable);
                try { saveLocalCoreCache(); } catch(e) {}
            } else if((window.rencanaData || []).length > 0) {
                // Jangan timpa storage dengan array kosong saat data server belum siap.
                saveLocalRencana(window.rencanaData);
            }
            return stable;
        }

        function isCurrentUserRencana(item) {
            if(!window.currentUser || window.isAdmin) return false;
            const nipOk = item.ownerNip && normalize(item.ownerNip) === normalize(window.currentUser.nip);
            const nameOk = item.ownerName && normalize(item.ownerName) === normalize(window.currentUser.nama);
            return nipOk || nameOk;
        }

        function isRencanaSelesai(item) {
            return normalize(item.status || '').includes('selesai');
        }

        function getRencanaJamReminder(item) {
            return extractTime(item?.jamReminder || item?.jam_reminder || item?.waktuReminder || item?.waktu_reminder || item?.jam || item?.waktu || '');
        }

        function getCurrentTimeKey() {
            const d = new Date();
            return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }

        function parseRencanaDueDate(item) {
            const tgl = String(item?.tanggal || '').trim();
            if(!tgl) return null;
            const jam = getRencanaJamReminder(item) || '00:00';
            const parts = tgl.split('-').map(Number);
            const timeParts = jam.split(':').map(Number);
            if(parts.length < 3 || parts.some(Number.isNaN)) return null;
            const hh = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
            const mm = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;
            return new Date(parts[0], parts[1] - 1, parts[2], hh, mm, 0, 0);
        }

        function getRencanaDueMinutes(item) {
            const due = parseRencanaDueDate(item);
            if(!due) return null;
            return Math.floor((new Date().getTime() - due.getTime()) / 60000);
        }

        function isRencanaWaktuSudahTiba(item) {
            if(isRencanaSelesai(item)) return false;
            const due = parseRencanaDueDate(item);
            if(!due) return false;
            return new Date().getTime() >= due.getTime();
        }

        function isRencanaTanggalHariIni(item) {
            return !isRencanaSelesai(item) && String(item.tanggal || '') === getTodayKey();
        }

        function isRencanaTerlewat(item) {
            if(isRencanaSelesai(item)) return false;
            const tgl = String(item.tanggal || '');
            if(!tgl) return false;
            if(tgl < getTodayKey()) return true;
            if(tgl > getTodayKey()) return false;
            const diffMin = getRencanaDueMinutes(item);
            // Di hari yang sama: beri masa “Waktunya” selama 60 menit.
            // Setelah lewat dari 60 menit dan belum ditandai selesai, status menjadi Terlewat.
            return diffMin !== null && diffMin > 60;
        }

        function isRencanaHariIni(item) {
            if(isRencanaSelesai(item) || String(item.tanggal || '') !== getTodayKey()) return false;
            const diffMin = getRencanaDueMinutes(item);
            return diffMin !== null && diffMin >= 0 && diffMin <= 60;
        }

        function isRencanaTerjadwalHariIni(item) {
            if(isRencanaSelesai(item) || String(item.tanggal || '') !== getTodayKey()) return false;
            const diffMin = getRencanaDueMinutes(item);
            return diffMin !== null && diffMin < 0;
        }

        function isRencanaDalamRentangMinggu(item) {
            const today = getTodayKey();
            const weekEnd = addDaysToKey(today, 7);
            const tgl = String(item.tanggal || today);
            if (isRencanaTerlewat(item)) return true;
            return tgl >= today && tgl <= weekEnd;
        }

        function getRencanaSortRank(item) {
            if (isRencanaTerlewat(item)) return 0;
            if (isRencanaHariIni(item)) return 1;
            if (isRencanaSelesai(item)) return 3;
            return 2;
        }

        function getPengumumanBadgeClass(jenis) {
            const key = normalize(jenis);
            if(key.includes('penting')) return 'bg-rose-50 text-rose-700 border-rose-100';
            if(key.includes('reminder')) return 'bg-amber-50 text-amber-700 border-amber-100';
            if(key.includes('mingguan')) return 'bg-cyan-50 text-cyan-700 border-cyan-100';
            return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        }

        function isPengumumanDalamRentangMinggu(item) {
            if(item.aktif === false) return false;
            const today = getTodayKey();
            const weekEnd = addDaysToKey(today, 7);
            const start = item.mulai || today;
            const end = item.selesai || start;
            // Beranda hanya menampilkan pengumuman yang masih aktif/akan datang 7 hari ke depan.
            // Jika tanggal selesai sudah lewat, pengumuman otomatis hilang dari Beranda tetapi tetap ada di panel admin.
            return start <= weekEnd && end >= today;
        }

        function getPengumumanStatusInfo(item) {
            const today = getTodayKey();
            const start = item.mulai || today;
            const end = item.selesai || start;
            if(item.aktif === false) return { label: 'Nonaktif', className: 'bg-slate-100 text-slate-500 border-slate-200', cardClass: 'opacity-70 bg-slate-50' };
            if(end < today) return { label: 'Berlalu', className: 'bg-slate-100 text-slate-500 border-slate-200', cardClass: 'opacity-70 bg-slate-50' };
            if(start > today) return { label: 'Akan Datang', className: 'bg-cyan-50 text-cyan-700 border-cyan-200', cardClass: 'bg-white' };
            return { label: 'Aktif', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', cardClass: 'bg-white' };
        }

        function setDefaultDates() {
            const today = getTodayKey();
            const currentMonth = today.slice(0, 7);
            const dateInput = document.getElementById('in-date');
            const filtLembur = document.getElementById('filt-lembur-bulan');
            const filtRekapStart = document.getElementById('filter-rekap-start');
            const filtRekapEnd = document.getElementById('filter-rekap-end');
            const adminFilterStart = document.getElementById('admin-filter-start');
            const adminFilterEnd = document.getElementById('admin-filter-end');
            const adminAnalyticsMonth = document.getElementById('admin-analytics-month');
            const adminSurveiMonth = document.getElementById('admin-survei-month');
            const surveyMonthLabel = document.getElementById('survey-month-label');
            const adminSpkDate = document.getElementById('admin-spk-date');
            const pengMulai = document.getElementById('pengumuman-mulai');
            const pengSelesai = document.getElementById('pengumuman-selesai');
            const rencanaTanggal = document.getElementById('rencana-tanggal');
            const rencanaJam = document.getElementById('rencana-jam');
            if(dateInput && !dateInput.value) dateInput.value = today;
            if(filtLembur && !filtLembur.value) filtLembur.value = currentMonth;
            // Filter Riwayat dan Rekap default dibuat kosong = Semua Waktu.
            // Tujuannya agar data lama di Google Sheet tidak tersembunyi oleh filter bulan berjalan.
            if(filtRekapStart && filtRekapStart.dataset.initialized !== 'true') {
                filtRekapStart.value = '';
                filtRekapStart.dataset.initialized = 'true';
            }
            if(filtRekapEnd && filtRekapEnd.dataset.initialized !== 'true') {
                filtRekapEnd.value = '';
                filtRekapEnd.dataset.initialized = 'true';
            }
            if(adminFilterStart && adminFilterStart.dataset.initialized !== 'true') {
                adminFilterStart.value = '';
                adminFilterStart.dataset.initialized = 'true';
            }
            if(adminFilterEnd && adminFilterEnd.dataset.initialized !== 'true') {
                adminFilterEnd.value = '';
                adminFilterEnd.dataset.initialized = 'true';
            }
            if(adminAnalyticsMonth && !adminAnalyticsMonth.value) adminAnalyticsMonth.value = currentMonth;
            if(adminSurveiMonth && !adminSurveiMonth.value) adminSurveiMonth.value = currentMonth;
            if(surveyMonthLabel) surveyMonthLabel.innerText = formatBulanIndonesia(currentMonth);
            if(adminSpkDate && !adminSpkDate.value) adminSpkDate.value = today;
            if(pengMulai && !pengMulai.value) pengMulai.value = today;
            if(pengSelesai && !pengSelesai.value) pengSelesai.value = addDaysToKey(today, 7);
            if(rencanaTanggal && !rencanaTanggal.value) rencanaTanggal.value = today;
            if(rencanaJam && !rencanaJam.value) {
                const now = new Date();
                now.setMinutes(now.getMinutes() + 5);
                rencanaJam.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            }
        }

        function setMotivation() {
            const quotes = [
                {
                    text: 'Langkah kecil yang dilakukan konsisten akan membantu pekerjaan besar terasa lebih ringan.',
                    source: 'Terinspirasi dari Lao Tzu'
                },
                {
                    text: 'Keberanian memulai dan kemauan memperbaiki adalah bagian penting dari kemajuan.',
                    source: 'Terinspirasi dari Nelson Mandela'
                },
                {
                    text: 'Kualitas kerja tumbuh dari kebiasaan baik yang dilakukan berulang setiap hari.',
                    source: 'Terinspirasi dari Aristoteles'
                },
                {
                    text: 'Perubahan besar sering dimulai dari tindakan sederhana yang dikerjakan dengan sungguh-sungguh.',
                    source: 'Terinspirasi dari Mahatma Gandhi'
                },
                {
                    text: 'Belajar, menyesuaikan diri, dan terus mencoba adalah cara menjaga karya tetap bermakna.',
                    source: 'Terinspirasi dari Albert Einstein'
                },
                {
                    text: 'Pekerjaan yang tercatat rapi hari ini akan membantu keputusan yang lebih baik esok hari.',
                    source: 'Terinspirasi dari Peter Drucker'
                }
            ];
            const selected = quotes[new Date().getDate() % quotes.length];
            const el = document.getElementById('motivation-text');
            const sourceEl = document.getElementById('motivation-source');
            if(el) el.innerText = selected.text;
            if(sourceEl) sourceEl.innerText = selected.source;
        }

        function isJurnalWriteAction(action) {
            return action === 'add_jurnal' || action === 'update_jurnal';
        }

        async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                return await fetch(url, { ...options, signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }
        }

        async function postToScript(action, payload, options = {}) {
            if(!SCRIPT_URL) throw new Error('SCRIPT_URL belum diatur.');
            const body = JSON.stringify({ action, payload });
            const timeoutMs = Number(options.timeoutMs || (isJurnalWriteAction(action) ? 12000 : 18000));

            // v175: Khusus simpan/update jurnal di GitHub Pages memakai satu kali no-cors POST.
            // Penyebab spinner lama: Apps Script kadang sudah menyimpan ke Sheet, tetapi responsnya
            // tidak kembali ke browser karena CORS/redirect. Dengan no-cors, UI tidak menunggu JSON.
            if(isJurnalWriteAction(action)) {
                try {
                    await fetchWithTimeout(SCRIPT_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        cache: 'no-store',
                        body
                    }, timeoutMs);
                    return { success: true, opaque: true };
                } catch(err) {
                    if(err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('abort'))) {
                        return { success: true, timeoutAssumed: true };
                    }
                    throw err;
                }
            }

            try {
                const response = await fetchWithTimeout(SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    cache: 'no-store',
                    body
                }, timeoutMs);
                const contentType = response.headers.get('content-type') || '';
                if(contentType.includes('application/json')) {
                    const result = await response.json();
                    if(result && result.success === false) throw new Error(result.message || 'Permintaan ditolak server.');
                    return result;
                }
                return { success: response.ok };
            } catch (err) {
                // Fallback untuk Apps Script lama yang belum mengaktifkan CORS.
                try {
                    await fetchWithTimeout(SCRIPT_URL, { method: 'POST', mode: 'no-cors', cache: 'no-store', body }, timeoutMs);
                    return { success: true, opaque: true };
                } catch(fallbackErr) {
                    if(fallbackErr && (fallbackErr.name === 'AbortError' || String(fallbackErr.message || '').toLowerCase().includes('abort'))) {
                        return { success: true, timeoutAssumed: true };
                    }
                    throw err;
                }
            }
        }

        function safeDataDukungUrl(url) {
            const raw = String(url || '').trim();
            if(!raw) return '';
            if(/^https?:\/\//i.test(raw)) return raw;
            return '';
        }

        function renderDataDukungLink(url, label = 'Data dukung') {
            const safeUrl = safeDataDukungUrl(url);
            if(!safeUrl) return '';
            return `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 mt-1 px-2 py-1 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 text-[8px] font-black uppercase tracking-widest">🔗 ${escapeHTML(label)}</a>`;
        }

        function getReviewStatusClass(status) {
            const key = normalize(status);
            if(key.includes('sesuai') || key.includes('ditindaklanjuti')) return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
            if(key.includes('data')) return 'bg-amber-50 text-amber-700 border border-amber-100';
            if(key.includes('perbaikan') || key.includes('tindak')) return 'bg-rose-50 text-rose-700 border border-rose-100';
            return 'bg-slate-50 text-slate-600 border border-slate-100';
        }

        function hasJurnalReview(d) {
            return !!(d && (d.catatanAtasan || d.statusEvaluasiAtasan || d.namaPemberiCatatan || d.tanggalCatatanAtasan));
        }

        function isJurnalReviewFollowedUp(d) {
            if(!d) return false;
            const statusFollow = normalize(d.statusTindakLanjutPegawai || '');
            const tanggalFollow = String(d.tanggalTindakLanjut || '').trim();
            return statusFollow.includes('sudah') || statusFollow.includes('ditindaklanjuti') || statusFollow.includes('selesai') || !!tanggalFollow;
        }

        function isJurnalReviewNeedsFollowUp(d) {
            if(!d || !String(d.catatanAtasan || '').trim()) return false;
            if(isJurnalReviewFollowedUp(d)) return false;
            const statusEval = normalize(d.statusEvaluasiAtasan || '');
            if(statusEval.includes('sudah sesuai') || statusEval.includes('sudah ditindaklanjuti')) return false;
            return true;
        }

        function getMyReviewedJurnalRowsForAlert() {
            if(!window.currentUser || window.isAdmin) return [];
            return (window.arikaData || [])
                .filter(d => personMatchesRow(d, window.currentUser))
                .filter(d => String(d.catatanAtasan || '').trim())
                .sort((a, b) => String(b.tanggalCatatanAtasan || b.date || '').localeCompare(String(a.tanggalCatatanAtasan || a.date || '')) || getJurnalSortTime(b) - getJurnalSortTime(a));
        }

        window.renderJurnalReviewAlert = function() {
            const alertEl = document.getElementById('jurnal-review-alert');
            const textEl = document.getElementById('jurnal-review-alert-text');
            if(!alertEl) return;

            if(!window.currentUser || window.isAdmin) {
                alertEl.classList.add('hidden');
                return;
            }

            const rows = getMyReviewedJurnalRowsForAlert();
            const pendingRows = rows.filter(isJurnalReviewNeedsFollowUp);
            if(!pendingRows.length) {
                alertEl.classList.add('hidden');
                return;
            }

            const latest = pendingRows[0];
            const tanggal = latest?.date ? formatHariTanggal(latest.date) : '-';
            const uraian = latest?.desc ? String(latest.desc).slice(0, 120) : 'Jurnal kegiatan';
            const statusText = `${pendingRows.length} catatan atasan belum ditindaklanjuti${rows.length > pendingRows.length ? ` dari ${rows.length} catatan atasan` : ''}.`;

            if(textEl) {
                textEl.innerHTML = `${escapeHTML(statusText)} Catatan terbaru yang perlu ditindaklanjuti: <strong>${escapeHTML(tanggal)}</strong> — ${escapeHTML(uraian)}${String(latest?.desc || '').length > 120 ? '...' : ''}`;
            }
            alertEl.classList.remove('hidden');
            try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'review-alert' }); } catch(e) {}
        };

        function renderCatatanAtasanBox(d, options = {}) {
            if(!hasJurnalReview(d)) return '';
            const compact = !!options.compact;
            const status = d.statusEvaluasiAtasan || 'Catatan Atasan';
            const reviewer = d.namaPemberiCatatan ? ` • ${escapeHTML(d.namaPemberiCatatan)}` : '';
            const tanggal = d.tanggalCatatanAtasan ? ` • ${escapeHTML(formatDateIndo(d.tanggalCatatanAtasan))}` : '';
            const follow = d.statusTindakLanjutPegawai ? `<span class="review-badge bg-white text-cyan-700 border border-cyan-100">${escapeHTML(d.statusTindakLanjutPegawai)}</span>` : '';
            const tindakBtn = (!window.isAdmin && isJurnalReviewNeedsFollowUp(d))
                ? `<button onclick="window.tandaiTindakLanjutJurnal('${escapeHTML(d.id)}')" class="mt-2 px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-100 text-[8px] font-black uppercase tracking-widest">✓ Tandai Sudah Ditindaklanjuti</button>`
                : '';
            return `
                <div class="review-card mt-2 text-left ${compact ? 'max-w-sm' : ''}">
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                        <span class="review-badge ${getReviewStatusClass(status)}">💬 ${escapeHTML(status)}</span>
                        ${follow}
                    </div>
                    ${d.catatanAtasan ? `<p class="text-[10px] text-slate-700 font-bold leading-relaxed whitespace-pre-line">${linkifyText(d.catatanAtasan)}</p>` : ''}
                    <p class="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-2">Catatan Atasan${reviewer}${tanggal}</p>
                    ${tindakBtn}
                </div>
            `;
        }

        window.openJurnalReviewModal = function(id) {
            if(!canReviewJurnal()) return window.showCustomAlert('Akses admin/atasan diperlukan.');
            const target = (window.arikaData || []).find(d => String(d.id) === String(id));
            if(!target) return window.showCustomAlert('Data jurnal tidak ditemukan.');

            const modal = document.getElementById('jurnal-review-modal');
            const idEl = document.getElementById('review-jurnal-id');
            const statusEl = document.getElementById('review-status');
            const catatanEl = document.getElementById('review-catatan');
            const summaryEl = document.getElementById('review-jurnal-summary');

            if(idEl) idEl.value = target.id || '';
            if(statusEl) statusEl.value = target.statusEvaluasiAtasan || 'Sudah sesuai';
            if(catatanEl) catatanEl.value = target.catatanAtasan || '';
            if(summaryEl) {
                summaryEl.innerHTML = `
                    <div class="font-black uppercase text-slate-800">${escapeHTML(target.name || '-')}</div>
                    <div class="mt-1 text-[10px] font-bold text-slate-500">${escapeHTML(formatHariTanggal(target.date))} • ${escapeHTML(target.lab || '-')}</div>
                    <div class="mt-2 text-[11px] text-slate-700 leading-relaxed">${escapeHTML(target.desc || '-')}</div>
                `;
            }

            if(modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        };

        window.closeJurnalReviewModal = function() {
            const modal = document.getElementById('jurnal-review-modal');
            if(modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        };

        window.saveJurnalReview = async function(e) {
            e.preventDefault();
            if(!canReviewJurnal()) return window.showCustomAlert('Akses admin/atasan diperlukan.');

            const id = document.getElementById('review-jurnal-id')?.value || '';
            const target = (window.arikaData || []).find(d => String(d.id) === String(id));
            if(!target) return window.showCustomAlert('Data jurnal tidak ditemukan.');

            const payload = {
                id,
                catatanAtasan: document.getElementById('review-catatan')?.value.trim() || '',
                statusEvaluasiAtasan: document.getElementById('review-status')?.value || 'Sudah sesuai',
                namaPemberiCatatan: window.currentUser?.nama || 'Administrator',
                tanggalCatatanAtasan: getTodayKey()
            };

            window.showLoader(true, 'Menyimpan catatan atasan...');
            try {
                await postToScript('save_jurnal_review', payload);
                Object.assign(target, payload);
                saveLocalCoreCache();
                window.closeJurnalReviewModal();
                renderCurrentDataState();
                window.showCustomAlert('Catatan atasan berhasil disimpan.');
                window.fetchCloudData && setTimeout(() => window.fetchCloudData(), 300);
            } catch(err) {
                window.showCustomAlert('Gagal menyimpan catatan atasan: ' + err.message);
            } finally {
                window.showLoader(false);
            }
        };

        window.tandaiTindakLanjutJurnal = async function(id) {
            if(!window.currentUser || window.isAdmin) return window.showCustomAlert('Fitur ini hanya untuk akun pegawai.');
            const target = (window.arikaData || []).find(d => String(d.id) === String(id));
            if(!target) return window.showCustomAlert('Data jurnal tidak ditemukan.');

            window.showLoader(true, 'Menyimpan tindak lanjut...');
            try {
                const payload = {
                    id,
                    statusTindakLanjutPegawai: 'Sudah Ditindaklanjuti',
                    tanggalTindakLanjut: getTodayKey()
                };
                await postToScript('update_jurnal_followup', payload);
                Object.assign(target, payload);
                saveLocalCoreCache();
                renderCurrentDataState();
                window.showCustomAlert('Status tindak lanjut berhasil disimpan.');
                window.fetchCloudData && setTimeout(() => window.fetchCloudData(), 300);
            } catch(err) {
                window.showCustomAlert('Gagal menyimpan tindak lanjut: ' + err.message);
            } finally {
                window.showLoader(false);
            }
        };

        function buildJurnalPayload() {
            const date = document.getElementById('in-date')?.value || getTodayKey();
            const cat = document.getElementById('in-cat')?.value || 'Lainnya';
            const desc = document.getElementById('in-desc')?.value.trim() || '';
            const status = document.getElementById('in-status')?.value || 'Selesai';
            const isLembur = Boolean(document.getElementById('in-is-lembur')?.checked);
            const suratTugas = document.getElementById('in-surat-tugas')?.value.trim() || '';
            const linkDataDukung = document.getElementById('in-link-data')?.value.trim() || '';
            const start = document.getElementById('in-start')?.value || '';
            const end = document.getElementById('in-end')?.value || '';

            if(!window.currentUser) throw new Error('Sesi pengguna belum aktif.');
            if(!date) throw new Error('Tanggal kegiatan wajib diisi.');
            if(!cat) throw new Error('Kategori wajib dipilih.');
            if(!desc) throw new Error('Uraian pekerjaan wajib diisi.');
            if(linkDataDukung && !safeDataDukungUrl(linkDataDukung)) throw new Error('Link data dukung harus diawali dengan http:// atau https://.');
            if(isLembur && (!start || !end)) throw new Error('Jam mulai dan selesai wajib diisi untuk kegiatan lembur.');

            const lamaLembur = isLembur ? formatDurasi(start, end) : '';
            const waktuLembur = isLembur && start && end ? `${start} - ${end}` : '';

            return {
                id: window.editingJurnalId || makeLocalId('jurnal'),
                date,
                name: window.currentUser.nama,
                nip: window.currentUser.nip || '',
                statusPegawai: window.currentUser.status || '',
                lab: window.currentUser.lab || '',
                cat,
                desc,
                status,
                isLembur,
                suratTugas,
                linkDataDukung: safeDataDukungUrl(linkDataDukung),
                start,
                end,
                lamaLembur,
                waktuLembur,
                createdAt: new Date().toISOString(),
                originalDate: window.editingJurnalOriginal?.date || date,
                originalName: window.editingJurnalOriginal?.name || window.currentUser.nama,
                originalDesc: window.editingJurnalOriginal?.desc || desc
            };
        }

        function resetJurnalForm() {
            const form = document.getElementById('form-arika');
            if(form) form.reset();
            setDefaultDates();
            const lemburFields = document.getElementById('lembur-fields');
            const warningEl = document.getElementById('holiday-warning');
            const successActions = document.getElementById('jurnal-success-actions');
            const successMsg = document.getElementById('msg-success');
            if(lemburFields) lemburFields.classList.add('hidden');
            if(warningEl) warningEl.classList.add('hidden');
            if(successActions) successActions.classList.add('hidden');
            if(successMsg) successMsg.classList.add('hidden');
            if(typeof setJurnalSavingState === 'function') setJurnalSavingState(false, false);
            const dName = document.getElementById('user-display-name');
            const dNip = document.getElementById('user-display-nip');
            const dStatus = document.getElementById('user-display-status');
            if(window.currentUser) {
                if(dName) dName.value = window.currentUser.nama?.toUpperCase() || '';
                if(dNip) dNip.value = window.currentUser.nip || '-';
                if(dStatus) dStatus.value = window.currentUser.status || '-';
            }
            setJurnalEditMode(false);
        }

        function setJurnalEditMode(active, item = null) {
            window.editingJurnalId = active && item ? item.id : null;
            window.editingJurnalOriginal = active && item ? { ...item } : null;

            const submitBtn = document.querySelector('#form-arika button[type="submit"]');
            if(submitBtn) {
                submitBtn.innerHTML = active ? '✏️ Simpan Perubahan Jurnal' : '🚀 Simpan Riwayat Kegiatan';
                submitBtn.classList.toggle('from-amber-500', active);
                submitBtn.classList.toggle('via-orange-500', active);
                submitBtn.classList.toggle('to-rose-500', active);
            }

            const form = document.getElementById('form-arika');
            if(form) {
                form.classList.toggle('jurnal-form-editing', !!active);
                form.classList.toggle('jurnal-form-new', !active);
            }

            const successActions = document.getElementById('jurnal-success-actions');
            const successMsg = document.getElementById('msg-success');
            if(successActions) successActions.classList.add('hidden');
            if(successMsg) successMsg.classList.add('hidden');

            let modeCard = document.getElementById('jurnal-mode-card');
            if(form && !modeCard) {
                modeCard = document.createElement('div');
                modeCard.id = 'jurnal-mode-card';
                form.parentNode.insertBefore(modeCard, form);
            }
            if(modeCard) {
                modeCard.className = active ? 'jurnal-mode-card jurnal-mode-edit' : 'jurnal-mode-card jurnal-mode-new';
                modeCard.innerHTML = active
                    ? `✏️ <b>Mode Sunting Riwayat Aktif</b><br><span>Anda sedang memperbaiki catatan tanggal <b>${escapeHTML(formatHariTanggal(item?.date || getTodayKey()))}</b>. Perubahan akan memperbarui riwayat lama, bukan membuat catatan baru.</span>`
                    : `📝 <b>Mode Catatan Baru</b><br><span>Form ini digunakan untuk menambahkan riwayat kegiatan baru hari ini.</span>`;
            }

            let notice = document.getElementById('jurnal-edit-notice');
            if(form && !notice) {
                notice = document.createElement('div');
                notice.id = 'jurnal-edit-notice';
                notice.className = 'hidden mb-6 p-4 bg-amber-50 border-2 border-amber-100 text-amber-800 rounded-2xl text-xs font-bold text-center';
                form.parentNode.insertBefore(notice, form);
            }
            if(notice) {
                notice.classList.toggle('hidden', !active);
                notice.innerHTML = active ? `Mode sunting jurnal aktif. Setelah selesai, klik <b>Simpan Perubahan Jurnal</b>. <button type="button" onclick="window.cancelEditJurnal()" class="ml-2 px-3 py-1 bg-white text-amber-700 rounded-lg font-black uppercase text-[9px]">Batal Edit</button>` : '';
            }
        }

        window.cancelEditJurnal = function() {
            const form = document.getElementById('form-arika');
            if(form) form.reset();
            setDefaultDates();
            setJurnalEditMode(false);
            window.toggleLemburFields();
        };

        window.editJurnal = function(id) {
            const target = (window.arikaData || []).find(d => String(d.id) === String(id));
            if(!target) return window.showCustomAlert('Data jurnal yang akan disunting tidak ditemukan.');
            window.nav('jurnal');
            setTimeout(() => {
                document.getElementById('in-date').value = target.date || getTodayKey();
                document.getElementById('in-cat').value = target.cat || 'Lainnya';
                document.getElementById('in-desc').value = target.desc || '';
                document.getElementById('in-status').value = target.status || 'Selesai';
                const lemburCheck = document.getElementById('in-is-lembur');
                if(lemburCheck) lemburCheck.checked = Boolean(target.isLembur);
                window.toggleLemburFields();
                document.getElementById('in-surat-tugas').value = target.suratTugas || '';
                const linkInput = document.getElementById('in-link-data');
                if(linkInput) linkInput.value = target.linkDataDukung || '';
                document.getElementById('in-start').value = target.start || '';
                document.getElementById('in-end').value = target.end || '';
                setJurnalEditMode(true, target);
                if (window.arikaSafeTopAfterNav) window.arikaSafeTopAfterNav(); else window.scrollTo({ top: 0, behavior: 'auto' });
            }, 150);
        };


        function setJurnalSavingState(active, isEditing = false) {
            const form = document.getElementById('form-arika');
            const btn = document.getElementById('btn-submit-jurnal') || document.querySelector('#form-arika button[type="submit"]');
            const progress = document.getElementById('jurnal-save-progress');
            window.arikaJurnalSaving = !!active;

            if(form) {
                form.classList.toggle('arika-jurnal-saving', !!active);
                if(active) form.setAttribute('aria-busy', 'true');
                else form.removeAttribute('aria-busy');
            }

            if(btn) {
                btn.disabled = !!active;
                btn.classList.toggle('opacity-80', !!active);
                btn.classList.toggle('cursor-wait', !!active);
                btn.classList.toggle('pointer-events-none', !!active);
                if(active) {
                    btn.setAttribute('aria-busy', 'true');
                    btn.innerHTML = `<span class="inline-flex items-center justify-center gap-3"><span class="jurnal-saving-spinner"></span><span>${isEditing ? 'Menyimpan Perubahan...' : 'Sedang Menyimpan Jurnal...'}</span></span>`;
                } else {
                    btn.removeAttribute('aria-busy');
                    btn.innerHTML = window.editingJurnalId ? '✏️ Simpan Perubahan Jurnal' : '🚀 Simpan Riwayat Kegiatan';
                }
            }

            if(progress) {
                progress.classList.toggle('hidden', !active);
                if(active) {
                    const title = progress.querySelector('span:last-child');
                    if(title) title.textContent = isEditing ? 'Perubahan jurnal sedang disimpan...' : 'Jurnal sedang disimpan...';
                    progress.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }

        function applyJurnalPayloadToLocal(payload, isEditing) {
            if(isEditing) {
                const existingRow = (window.arikaData || []).find(d => String(d.id) === String(payload.id)) || {};
                const mergedPayload = { ...existingRow, ...payload };
                window.arikaData = (window.arikaData || []).map(d => String(d.id) === String(payload.id) ? mergedPayload : d);
                filtered = filtered.map(d => String(d.id) === String(payload.id) ? mergedPayload : d);
            } else {
                const alreadyExists = (window.arikaData || []).some(d => String(d.id) === String(payload.id));
                if(!alreadyExists) window.arikaData.unshift(payload);
                const filteredExists = (filtered || []).some(d => String(d.id) === String(payload.id));
                if(!filteredExists) filtered = [payload, ...(filtered || [])];
            }
            saveLocalCoreCache();
            renderCurrentDataState();
            updateLeaderboard();
            triggerDailyReminder();
            window.runFilter();
            window.renderVisualCalendar();
            window.renderLemburTable();
        }

        function finishJurnalSubmitSuccess(payload, isEditing, options = {}) {
            setJurnalSavingState(false, false);
            window.showLoader(false);
            resetJurnalForm();

            const msg = document.getElementById('msg-success');
            const actions = document.getElementById('jurnal-success-actions');
            if(msg) {
                msg.innerText = options.timeoutAssumed
                    ? '✅ Jurnal dikirim. Jika belum terlihat, klik Lihat Riwayat / refresh data.'
                    : (isEditing ? '✨ Perubahan Riwayat Berhasil Disimpan!' : '✨ Data Berhasil Tersimpan!');
                msg.classList.remove('hidden');
                setTimeout(() => msg.classList.add('hidden'), options.timeoutAssumed ? 5200 : 3200);
            }
            if(actions) {
                actions.classList.remove('hidden');
                actions.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            if(!isEditing) showKetuaTimWaPrompt(payload);

            // Sinkron ulang berjalan di background. Tidak boleh menahan tombol simpan.
            setTimeout(() => window.fetchLiveJurnalFromSheet && window.fetchLiveJurnalFromSheet({ silent: true, timeoutMs: 12000 }), 900);
        }

        async function handleJurnalSubmit(e) {
            e.preventDefault();
            if(window.arikaJurnalSaving) return;
            let payload;
            try {
                payload = buildJurnalPayload();
            } catch(err) {
                window.showCustomAlert(err.message);
                return;
            }

            const isEditing = Boolean(window.editingJurnalId);
            let uiCompleted = false;
            let assumeTimer = null;

            const completeSuccessOnce = (options = {}) => {
                if(uiCompleted) return;
                uiCompleted = true;
                if(assumeTimer) clearTimeout(assumeTimer);
                applyJurnalPayloadToLocal(payload, isEditing);
                finishJurnalSubmitSuccess(payload, isEditing, options);
            };

            setJurnalSavingState(true, isEditing);
            window.showLoader(true, isEditing ? 'Menyimpan Perubahan...' : 'Menyimpan Riwayat...');

            // v175: Pengaman UI. Jika Apps Script sudah menyimpan tetapi respons lambat/tidak kembali,
            // spinner tidak akan menggantung terus.
            assumeTimer = setTimeout(() => {
                if(window.arikaJurnalSaving && !uiCompleted) {
                    completeSuccessOnce({ timeoutAssumed: true });
                }
            }, 14000);

            try {
                const result = await postToScript(isEditing ? 'update_jurnal' : 'add_jurnal', payload, { timeoutMs: 12000 });
                completeSuccessOnce({ timeoutAssumed: !!(result && result.timeoutAssumed) });
            } catch(err) {
                console.error(err);
                if(!uiCompleted) {
                    window.showCustomAlert('Gagal menyimpan jurnal: ' + (err.message || err));
                }
            } finally {
                if(assumeTimer) clearTimeout(assumeTimer);
                if(!uiCompleted) {
                    setJurnalSavingState(false, false);
                    window.showLoader(false);
                } else {
                    // Pastikan tidak ada sisa spinner/pointer-events dari proses sebelumnya.
                    setTimeout(() => setJurnalSavingState(false, false), 80);
                }
            }
        }

        window.forceResetJurnalSaving = function() {
            setJurnalSavingState(false, false);
            window.showLoader(false);
        };

        // --- 🗓️ RENCANA        // --- 🗓️ RENCANA KEGIATAN PRIBADI PEGAWAI ---
        window.renderRencanaPribadi = function() {
            const card = document.getElementById('personal-reminder-card');
            const listEl = document.getElementById('rencana-pribadi-list');
            if(card) card.classList.toggle('hidden', !window.currentUser || window.isAdmin);
            if(!listEl || !window.currentUser || window.isAdmin) return;

            window.rencanaData = getStableRencanaData();
            const list = dedupeRencanaList((window.rencanaData || [])
                .filter(isCurrentUserRencana)
                .filter(isRencanaDalamRentangMinggu))
                .sort((a, b) => {
                    const rankDiff = getRencanaSortRank(a) - getRencanaSortRank(b);
                    if(rankDiff !== 0) return rankDiff;
                    const dateDiff = String(a.tanggal || '').localeCompare(String(b.tanggal || ''));
                    if(dateDiff !== 0) return dateDiff;
                    return String(getRencanaJamReminder(a) || '99:99').localeCompare(String(getRencanaJamReminder(b) || '99:99'));
                });

            if(list.length === 0) {
                listEl.innerHTML = '<div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center text-slate-400 text-[10px] uppercase tracking-widest font-black">Belum ada rencana pribadi aktif minggu ini</div>';
                return;
            }

            const overdueCount = list.filter(isRencanaTerlewat).length;
            const todayCount = list.filter(isRencanaHariIni).length;
            const upcomingCount = list.filter(item => !isRencanaSelesai(item) && !isRencanaTerlewat(item) && !isRencanaHariIni(item)).length;

            const summaryHtml = `
                <div class="grid grid-cols-3 gap-2 mb-3">
                    <div class="rounded-2xl border border-amber-100 bg-amber-50 p-2 text-center">
                        <span class="reminder-alarm inline-block text-lg">🔔</span>
                        <p class="text-[8px] font-black uppercase tracking-widest text-amber-700">Waktunya</p>
                        <p class="text-lg font-black text-amber-700 leading-none">${todayCount}</p>
                    </div>
                    <div class="rounded-2xl border border-rose-100 bg-rose-50 p-2 text-center">
                        <span class="inline-block text-lg">⚠️</span>
                        <p class="text-[8px] font-black uppercase tracking-widest text-rose-700">Terlewat</p>
                        <p class="text-lg font-black text-rose-700 leading-none">${overdueCount}</p>
                    </div>
                    <div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-2 text-center">
                        <span class="inline-block text-lg">📅</span>
                        <p class="text-[8px] font-black uppercase tracking-widest text-emerald-700">Minggu Ini</p>
                        <p class="text-lg font-black text-emerald-700 leading-none">${upcomingCount}</p>
                    </div>
                </div>
            `;

            const visibleList = list.slice(0, 3);
            const moreInfo = list.length > 3 ? `<div class="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Menampilkan 3 rencana teratas dari ${list.length} rencana aktif minggu ini.</div>` : '';

            const listHtml = visibleList.map(item => {
                const todayActive = isRencanaHariIni(item);
                const todayScheduled = isRencanaTerjadwalHariIni(item);
                const overdue = isRencanaTerlewat(item);
                const statusDone = isRencanaSelesai(item);
                const jamReminder = getRencanaJamReminder(item);
                const baseClass = 'p-4 rounded-2xl border relative overflow-hidden';
                const badge = statusDone
                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                    : overdue
                        ? 'reminder-overdue-card bg-rose-50 text-rose-700 border-rose-200'
                        : todayActive
                            ? 'reminder-today-card bg-amber-50 text-amber-800 border-amber-200'
                            : todayScheduled
                                ? 'bg-cyan-50 text-cyan-700 border-cyan-100'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-100';
                const label = statusDone ? 'Selesai' : (overdue ? 'Terlewat' : (todayActive ? 'Alarm Sekarang' : (todayScheduled ? 'Terjadwal Hari Ini' : 'Minggu Ini')));
                const icon = statusDone ? '✅' : (overdue ? '⚠️' : (todayActive ? '<span class="reminder-alarm inline-block">🔔</span>' : (todayScheduled ? '⏰' : '📅')));
                const warningText = overdue
                    ? '<div class="mt-3 p-2 rounded-xl bg-white/70 border border-rose-100 text-[10px] font-bold text-rose-700">Rencana ini melewati tanggal target. Tandai selesai jika sudah dikerjakan, atau hapus bila sudah tidak diperlukan.</div>'
                    : (todayActive ? '<div class="mt-3 p-2 rounded-xl bg-white/70 border border-amber-100 text-[10px] font-bold text-amber-700">Jam reminder sudah tiba. Jangan lupa selesaikan atau catat kegiatannya di jurnal.</div>' : (todayScheduled ? '<div class="mt-3 p-2 rounded-xl bg-white/70 border border-cyan-100 text-[10px] font-bold text-cyan-700">Reminder akan berbunyi sesuai jam yang dipilih.</div>' : ''));
                return `
                    <div class="${baseClass} ${badge}">
                        ${todayActive ? '<span class="reminder-dot-pulse absolute top-3 right-12 w-2.5 h-2.5 rounded-full bg-amber-500"></span>' : ''}
                        <div class="flex justify-between items-start gap-3 mb-2">
                            <div class="min-w-0">
                                <span class="inline-flex items-center gap-1 mb-2 text-[8px] font-black uppercase tracking-widest">${icon} ${jamReminder ? '⏰ ' + escapeHTML(jamReminder) : '⏰ Tanpa Jam'} • ${label}</span>
                                <h4 class="font-black text-slate-900 text-xs uppercase leading-snug ${statusDone ? 'line-through opacity-60' : ''}">${escapeHTML(item.judul || 'Rencana kegiatan')}</h4>
                            </div>
                            <button onclick="window.hapusRencanaPribadi('${escapeHTML(item.id)}')" class="shrink-0 p-1.5 rounded-lg bg-white/70 hover:bg-rose-100 text-rose-500 text-[10px] font-black" title="Hapus reminder">🗑️</button>
                        </div>
                        <p class="text-[10px] font-bold opacity-80 mb-2">${escapeHTML(formatHariTanggal(item.tanggal))}${jamReminder ? ` • Pukul ${escapeHTML(jamReminder)}` : ''}</p>
                        ${item.catatan ? `<p class="text-xs text-slate-600 leading-relaxed whitespace-pre-line">${escapeHTML(item.catatan)}</p>` : ''}
                        ${warningText}
                        ${!statusDone ? `<div class="mt-3 flex flex-wrap gap-2"><button onclick="window.tandaiRencanaSelesai('${escapeHTML(item.id)}')" class="px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white text-[9px] font-black uppercase tracking-widest">Tandai Selesai</button>${todayActive || overdue ? `<button onclick="window.nav('jurnal')" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-[9px] font-black uppercase tracking-widest">Isi Jurnal</button>` : ''}</div>` : ''}
                    </div>
                `;
            }).join('');

            listEl.innerHTML = summaryHtml + listHtml + moreInfo;
            try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'rencana' }); } catch(e) {}
        };

        window.simpanRencanaPribadi = async function(e) {
            if(e) {
                e.preventDefault();
                if(typeof e.stopPropagation === 'function') e.stopPropagation();
            }
            if(window.isSavingRencana) return;
            if(!window.currentUser || window.isAdmin) return window.showCustomAlert('Fitur rencana pribadi hanya untuk akun pegawai.');

            const payload = {
                id: makeLocalId('rencana'),
                ownerName: window.currentUser.nama || '',
                ownerNip: window.currentUser.nip || '',
                tanggal: document.getElementById('rencana-tanggal')?.value || getTodayKey(),
                jamReminder: document.getElementById('rencana-jam')?.value || '',
                periode: 'Reminder',
                judul: document.getElementById('rencana-judul')?.value.trim() || '',
                catatan: document.getElementById('rencana-catatan')?.value.trim() || '',
                status: 'Aktif',
                createdAt: new Date().toISOString(),
                syncStatus: 'pending'
            };

            if(!payload.judul) return window.showCustomAlert('Rencana kegiatan wajib diisi.');
            if(!payload.jamReminder) return window.showCustomAlert('Jam reminder wajib dipilih.');

            const existingSame = (window.rencanaData || []).find(item =>
                isCurrentUserRencana(item) && getRencanaKey(item) === getRencanaKey(payload)
            );
            if(existingSame) {
                window.showCustomAlert('Reminder yang sama sudah ada, jadi tidak disimpan ulang.');
                return;
            }

            window.isSavingRencana = true;
            window.showLoader(true, 'Menyimpan Reminder...');

            // v132: Simpan cepat secara optimistis. Data langsung masuk ke tampilan dan localStorage,
            // sedangkan sinkronisasi Google Sheet berjalan di belakang layar. Ini menghindari loader
            // menunggu respons Apps Script/Google Sheet yang kadang lambat saat cold start.
            try {
                window.rencanaData = saveStableRencanaData([payload, ...(window.rencanaData || []), ...loadLocalRencana()]);

                const form = document.getElementById('form-rencana-pribadi');
                if(form) form.reset();
                setDefaultDates();
                window.renderRencanaPribadi();
                window.showLoader(false);
                window.isSavingRencana = false;

                // Setelah reminder baru disimpan, cek alarm langsung dan pastikan watcher aktif.
                // v182: lakukan beberapa cek awal. Jika rencana dibuat mendekati jam reminder lalu user pindah tab,
                // alarm tetap punya beberapa kesempatan sebelum timer background ditahan browser.
                try { window.startArikaReminderSoundWatcher && window.startArikaReminderSoundWatcher(); } catch(e) {}
                [650, 5000, 12000].forEach((delay) => {
                    setTimeout(() => {
                        try {
                            if(typeof getStableRencanaData === 'function') window.rencanaData = getStableRencanaData(window.rencanaData || []);
                            window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'save-rencana-' + delay, forceRencana: true });
                        } catch(e) {}
                    }, delay);
                });

                postToScript('save_rencana', payload)
                    .then(function(resp) {
                        try {
                            const syncedItem = (window.rencanaData || []).find(r => String(r.id) === String(payload.id));
                            if(syncedItem) syncedItem.syncStatus = 'synced';
                            if(resp && resp.id && resp.id !== payload.id) {
                                const item = syncedItem || (window.rencanaData || []).find(r => String(r.id) === String(payload.id));
                                if(item) {
                                    item.id = resp.id;
                                    item.syncStatus = 'synced';
                                    saveStableRencanaData(window.rencanaData);
                                    window.renderRencanaPribadi();
                                }
                            } else if(syncedItem) {
                                saveStableRencanaData(window.rencanaData);
                            }
                            if(window.scheduleSaveCloudDataCache) window.scheduleSaveCloudDataCache();
                        } catch(syncErr) {
                            console.warn('Sinkronisasi cache reminder gagal:', syncErr);
                        }
                    })
                    .catch(function(err) {
                        console.warn('Sinkronisasi reminder ke Google Sheet gagal. Data tetap tersimpan lokal dan akan muncul di perangkat ini:', err);
                    });
            } catch(err) {
                console.warn('Simpan reminder lokal gagal:', err);
                window.isSavingRencana = false;
                window.showLoader(false);
                window.showCustomAlert('Reminder belum berhasil disimpan. Silakan coba lagi.');
            }
        };

        window.hapusRencanaPribadi = function(id) {
            const targetId = String(id || '').trim();
            const stableList = getStableRencanaData();
            const target = stableList.find(r => String(r.id || '').trim() === targetId) || (window.rencanaData || []).find(r => String(r.id || '').trim() === targetId);
            if(!target) return;
            window.showCustomConfirm(`Hapus reminder "${target.judul}"?`, () => {
                window.showLoader(true, 'Menghapus Reminder...');

                // v178: hapus optimistis dari tampilan terlebih dahulu.
                // Google Sheet tetap dihapus di belakang layar agar Beranda tidak menunggu respons Apps Script/cache.
                markRencanaAsLocallyDeleted(target);
                window.rencanaData = applyRencanaDeleteTombstones(
                    stableList.filter(r => !rencanaMatchesDeleteTarget(r, target))
                );
                saveLocalRencana(window.rencanaData);
                try { saveLocalCoreCache(); } catch(e) {}
                window.renderRencanaPribadi();
                window.showLoader(false);
                try { updateSyncStatus('Rencana dihapus dari tampilan, sinkronisasi berjalan...', 'info'); } catch(_) {}

                postToScript('delete_rencana', {
                    id: targetId,
                    ownerName: target.ownerName || window.currentUser?.nama || '',
                    ownerNip: target.ownerNip || window.currentUser?.nip || '',
                    tanggal: target.tanggal || '',
                    jamReminder: getRencanaJamReminder(target) || '',
                    judul: target.judul || '',
                    catatan: target.catatan || ''
                })
                    .then(function() {
                        try { updateSyncStatus('Rencana berhasil dihapus', 'ok'); } catch(_) {}
                        try { window.fetchCloudData && window.fetchCloudData({ force: true }); } catch(_) {}
                    })
                    .catch(function(err) {
                        console.warn('Hapus rencana dikirim tetapi respons Apps Script terlambat/gagal:', err);
                        try { updateSyncStatus('Tampilan sudah diperbarui, sinkron hapus dicek ulang...', 'warn'); } catch(_) {}
                        try { setTimeout(() => window.fetchCloudData && window.fetchCloudData({ force: true }), 1200); } catch(_) {}
                    });
            });
        };

        window.tandaiRencanaSelesai = async function(id) {
            const target = (window.rencanaData || []).find(r => String(r.id) === String(id));
            if(!target) return;
            target.status = 'Selesai';
            saveLocalRencana(window.rencanaData);
            try { saveLocalCoreCache(); } catch(e) {}
            window.renderRencanaPribadi();
            try {
                await postToScript('update_rencana_status', { id, status: 'Selesai' });
            } catch(err) {
                console.warn('Update status cloud gagal:', err);
            }
        };

        // --- 📌 PAPAN PENGUMUMAN BERANDA ---

        function splitTargetFungsi(value) {
            return String(value || 'Semua')
                .split(/[,;|]/)
                .map(v => v.trim())
                .filter(Boolean);
        }

        function getPengumumanTargetValues() {
            const select = document.getElementById('pengumuman-target-fungsi');
            if(!select) return ['Semua'];
            const values = Array.from(select.selectedOptions || []).map(opt => opt.value).filter(Boolean);
            if(!values.length || values.includes('Semua')) return ['Semua'];
            return values;
        }

        window.setPengumumanTargetSemua = function() {
            const select = document.getElementById('pengumuman-target-fungsi');
            if(!select) return;
            Array.from(select.options).forEach(opt => opt.selected = opt.value === 'Semua');
        };

        window.clearPengumumanTarget = function() {
            const select = document.getElementById('pengumuman-target-fungsi');
            if(!select) return;
            Array.from(select.options).forEach(opt => opt.selected = false);
        };

        function setPengumumanTargetValues(value) {
            const select = document.getElementById('pengumuman-target-fungsi');
            if(!select) return;
            const values = splitTargetFungsi(value);
            const normalized = values.map(normalize);
            Array.from(select.options).forEach(opt => {
                opt.selected = normalized.includes(normalize(opt.value));
            });
            if(!Array.from(select.selectedOptions || []).length) {
                window.setPengumumanTargetSemua();
            }
        }

        function isPengumumanUntukUser(item) {
            const targets = splitTargetFungsi(item?.targetFungsi || 'Semua');
            const normalizedTargets = targets.map(normalize);
            if(!normalizedTargets.length || normalizedTargets.includes(normalize('Semua')) || normalizedTargets.includes(normalize('Semua Fungsi/Lab'))) return true;
            if(window.isAdmin) return true;
            const userLab = normalize(window.currentUser?.lab || '');
            if(!userLab) return true;
            return normalizedTargets.includes(userLab);
        }

        function isAgendaUntukUser(item) {
            if(!item || !window.currentUser || window.isAdmin) return false;
            const nip = normalize(window.currentUser.nip || '');
            const nama = normalize(window.currentUser.nama || '');
            const nipList = String(item.pesertaNip || '').split(/[,;|]/).map(normalize).filter(Boolean);
            const namaList = String(item.pesertaNama || '').split(/[,;|]/).map(normalize).filter(Boolean);
            return (nip && nipList.includes(nip)) || (nama && namaList.includes(nama));
        }

        function getAgendaDateTime(item) {
            if(!item || !item.tanggal) return null;
            const time = item.waktuMulai || '08:00';
            const dt = new Date(`${item.tanggal}T${time}:00`);
            if(Number.isNaN(dt.getTime())) return null;
            return dt;
        }

        function isAgendaBerlaluTanggal(item) {
            if(!item || !item.tanggal) return false;
            return String(item.tanggal || '') < getTodayKey();
        }

        function isAgendaTampilDiBeranda(item, maxDate) {
            if(!item || item.aktif === false) return false;
            const today = getTodayKey();
            if(!item.tanggal) return true;
            // Agenda tetap tampil sepanjang hari-H, walaupun jam mulai sudah lewat.
            // Setelah masuk H+1, agenda otomatis hilang dari Beranda dan tetap menjadi arsip di Admin.
            return item.tanggal >= today && (!maxDate || item.tanggal <= maxDate);
        }

        function getAgendaReminderInfo(item) {
            if(item?.aktif === false) {
                return {
                    status: 'nonaktif',
                    label: 'Nonaktif',
                    icon: '🗄️',
                    cardClass: 'bg-slate-50 text-slate-500 border-slate-200',
                    ringClass: '',
                    hint: 'Agenda ini sudah dinonaktifkan dan tidak tampil di Beranda.',
                    sortPriority: 7,
                    diffMs: 999999999
                };
            }

            if(isAgendaBerlaluTanggal(item)) {
                return {
                    status: 'berlalu',
                    label: 'Berlalu',
                    icon: '🗄️',
                    cardClass: 'bg-slate-50 text-slate-500 border-slate-200',
                    ringClass: '',
                    hint: 'Agenda ini sudah melewati tanggal kegiatan. Di Beranda agenda ini otomatis disembunyikan dan tersimpan sebagai arsip admin.',
                    sortPriority: 6,
                    diffMs: 999999998
                };
            }

            const agendaTime = getAgendaDateTime(item);
            const now = new Date();
            if(!agendaTime) {
                return {
                    status: 'tanpa_jadwal',
                    label: 'Agenda',
                    icon: '🗓️',
                    cardClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
                    ringClass: '',
                    hint: 'Agenda ini belum memiliki waktu mulai yang spesifik.',
                    sortPriority: 4,
                    diffMs: 999999999
                };
            }
            const diffMs = agendaTime.getTime() - now.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            const todayKey = getTodayKey();

            if(diffMs < -2 * 60 * 60 * 1000) {
                return {
                    status: 'lewat_hari_ini',
                    label: item.tanggal === getTodayKey() ? 'Lewat Waktu Hari Ini' : 'Sudah Lewat',
                    icon: '✅',
                    cardClass: item.tanggal === getTodayKey() ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-slate-50 text-slate-500 border-slate-200',
                    ringClass: '',
                    hint: item.tanggal === getTodayKey()
                        ? 'Agenda ini sudah melewati jam mulai, tetapi tetap ditampilkan sampai hari ini selesai.'
                        : 'Agenda ini sudah melewati waktu mulai.',
                    sortPriority: item.tanggal === getTodayKey() ? 2 : 5,
                    diffMs
                };
            }

            if(diffMs <= 0) {
                return {
                    status: 'mulai',
                    label: 'Sedang / Mulai Sekarang',
                    icon: '🚨',
                    cardClass: 'bg-rose-50 text-rose-700 border-rose-200',
                    ringClass: 'ring-2 ring-rose-200 animate-pulse',
                    hint: 'Agenda sudah memasuki waktu mulai. Pastikan kehadiran dan persiapan sudah siap.',
                    sortPriority: 0,
                    diffMs
                };
            }

            if(diffHours <= 24) {
                const roundedHours = Math.floor(diffHours);
                const roundedMinutes = Math.max(0, Math.round((diffHours - roundedHours) * 60));
                const remainText = roundedHours > 0
                    ? `${roundedHours} jam ${roundedMinutes} menit lagi`
                    : `${roundedMinutes || 1} menit lagi`;
                return {
                    status: '24jam',
                    label: 'Pengingat 24 Jam',
                    icon: '🔔',
                    cardClass: 'bg-amber-50 text-amber-700 border-amber-200',
                    ringClass: 'ring-2 ring-amber-200 animate-pulse',
                    hint: `Agenda dimulai sekitar ${remainText}. Siapkan bahan, dokumen, atau perlengkapan yang diperlukan.`,
                    sortPriority: 1,
                    diffMs
                };
            }

            if(item.tanggal === todayKey) {
                return {
                    status: 'hari_ini',
                    label: 'Hari Ini',
                    icon: '📍',
                    cardClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    ringClass: 'ring-2 ring-emerald-100',
                    hint: 'Agenda berlangsung hari ini. Cek kembali waktu, lokasi, dan peserta wajib.',
                    sortPriority: 2,
                    diffMs
                };
            }

            return {
                status: 'mendatang',
                label: 'Agenda Mendatang',
                icon: '🗓️',
                cardClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
                ringClass: '',
                hint: 'Agenda mendatang. Boleh mulai disiapkan dari sekarang.',
                sortPriority: 3,
                diffMs
            };
        }

        function sortAgendaInteraktif(a, b) {
            const ai = getAgendaReminderInfo(a);
            const bi = getAgendaReminderInfo(b);
            if(ai.sortPriority !== bi.sortPriority) return ai.sortPriority - bi.sortPriority;
            return ai.diffMs - bi.diffMs;
        }

        window.renderAgendaSaya = function() {
            const board = document.getElementById('agenda-board');
            if(!board) return;

            const titleEl = document.getElementById('agenda-board-title');
            const subtitleEl = document.getElementById('agenda-board-subtitle');
            const today = getTodayKey();
            const maxDate = addDaysToKey(today, 14);

            let list = [];
            if(window.isAdmin) {
                if(titleEl) titleEl.innerText = '🗓️ Agenda Kegiatan Tim';
                if(subtitleEl) subtitleEl.innerText = 'Pantau jadwal tim yang masih perlu ditindaklanjuti.';
                list = (window.agendaData || [])
                    .filter(a => isAgendaTampilDiBeranda(a, maxDate))
                    .sort(sortAgendaInteraktif);
            } else {
                if(titleEl) titleEl.innerText = '🗓️ Agenda Kegiatan Saya';
                if(subtitleEl) subtitleEl.innerText = 'Lihat jadwal yang perlu kamu ikuti.';

                if(!window.currentUser) {
                    board.innerHTML = '<div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center text-slate-400 text-[10px] uppercase tracking-widest font-black">Agenda personal muncul setelah pegawai login</div>';
                    return;
                }

                list = (window.agendaData || [])
                    .filter(a => isAgendaTampilDiBeranda(a, maxDate))
                    .filter(isAgendaUntukUser)
                    .sort(sortAgendaInteraktif);
            }

            if(!list.length) {
                board.innerHTML = `<div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center text-slate-400 text-[10px] uppercase tracking-widest font-black">${window.isAdmin ? 'Belum ada agenda tim aktif/mendatang dalam 14 hari ke depan' : 'Belum ada agenda aktif/mendatang untuk kamu'}</div>`;
                return;
            }

            const visibleList = list.slice(0, 3);
            const moreInfo = list.length > 3 ? `<div class="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Menampilkan 3 agenda teratas dari ${list.length} agenda aktif.</div>` : '';

            board.innerHTML = visibleList.map(item => {
                const info = getAgendaReminderInfo(item);
                const timeText = item.waktuMulai ? ` • ${escapeHTML(item.waktuMulai)} WIT` : ' • Waktu belum diisi';
                const pesertaBerandaArr = uniqueAgendaTextList(item.pesertaNama || item.pesertaNip || '-');
                const pesertaBeranda = pesertaBerandaArr.length > 5 ? `${pesertaBerandaArr.slice(0, 5).join(', ')} +${pesertaBerandaArr.length - 5} lainnya` : (pesertaBerandaArr.join(', ') || '-');
                const pesertaText = window.isAdmin ? `<p class="text-[10px] text-slate-500 font-bold mt-1">Wajib ikut: ${escapeHTML(pesertaBeranda)}</p>` : '';
                const reminderBadge = info.status === '24jam'
                    ? '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/80 border border-amber-200 text-[8px] font-black uppercase tracking-widest text-amber-700">🔔 Siapkan dari sekarang</span>'
                    : (info.status === 'mulai' ? '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/80 border border-rose-200 text-[8px] font-black uppercase tracking-widest text-rose-700">🚨 Mulai sekarang</span>' : '');
                return `
                    <div class="agenda-card-item p-4 rounded-2xl border ${info.cardClass} ${info.ringClass} transition-all hover:-translate-y-0.5 hover:shadow-lg overflow-hidden">
                        <div class="flex items-start gap-3">
                            <div class="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white/85 shadow-sm text-xl">${info.icon}</div>
                            <div class="min-w-0 flex-1">
                                <div class="flex flex-wrap items-center gap-2 mb-1">
                                    <span class="text-[9px] font-black uppercase tracking-widest">${escapeHTML(info.label)}</span>
                                    <span class="text-[9px] font-bold opacity-80">${escapeHTML(formatDateIndo(item.tanggal) || 'Tanpa tanggal')}${timeText}</span>
                                    ${reminderBadge}
                                </div>
                                <h3 class="font-black text-slate-900 text-sm uppercase tracking-tight">${escapeHTML(item.judul || 'Agenda Kegiatan')}</h3>
                                <p class="text-[11px] text-slate-500 font-bold mt-1">${escapeHTML(item.jenis || 'Agenda')}${item.lokasi ? ' • ' + linkifyText(item.lokasi) : ''}</p>
                                ${pesertaText}
                                <div class="mt-3 p-2 rounded-xl bg-white/75 border border-white/80 text-[10px] font-bold leading-relaxed">${escapeHTML(info.hint)}</div>
                                ${item.keterangan ? `<p class="agenda-long-text text-xs text-slate-600 mt-2 leading-relaxed whitespace-pre-line">${linkifyText(item.keterangan)}</p>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('') + moreInfo;
            try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'agenda' }); } catch(e) {}
        };

        window.renderPengumumanBoard = function() {
            const board = document.getElementById('pengumuman-board');
            if(!board) return;

            const today = getTodayKey();
            const tomorrow = (() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                return d.toLocaleDateString('en-CA');
            })();
            const list = (window.pengumumanData || [])
                .filter(isPengumumanUntukUser)
                .filter(isPengumumanDalamRentangMinggu)
                .sort((a,b) => {
                    const aStart = a.mulai || today;
                    const aEnd = a.selesai || aStart;
                    const bStart = b.mulai || today;
                    const bEnd = b.selesai || bStart;
                    const aToday = aStart <= today && aEnd >= today;
                    const bToday = bStart <= today && bEnd >= today;
                    const aTomorrow = !aToday && aStart <= tomorrow && aEnd >= tomorrow;
                    const bTomorrow = !bToday && bStart <= tomorrow && bEnd >= tomorrow;
                    if(aToday !== bToday) return aToday ? -1 : 1;
                    if(aTomorrow !== bTomorrow) return aTomorrow ? -1 : 1;
                    return String(a.mulai || '').localeCompare(String(b.mulai || ''));
                });

            if(list.length === 0) {
                board.innerHTML = '<div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center text-slate-400 text-[10px] uppercase tracking-widest font-black">Belum ada pengumuman aktif</div>';
                return;
            }

            const visibleList = list.slice(0, 3);
            const moreInfo = list.length > 3 ? `<div class="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Menampilkan 3 pengumuman teratas dari ${list.length} pengumuman aktif.</div>` : '';

            board.innerHTML = visibleList.map(item => {
                const start = item.mulai || today;
                const end = item.selesai || start;
                const todayActive = start <= today && end >= today;
                const tomorrowActive = !todayActive && start <= tomorrow && end >= tomorrow;
                const rangeText = item.mulai && item.selesai
                    ? `${formatDateIndo(item.mulai)} s.d. ${formatDateIndo(item.selesai)}`
                    : (item.mulai ? formatDateIndo(item.mulai) : 'Tanpa tanggal');
                const timeText = item.waktuMulai ? `Mulai pukul ${item.waktuMulai} WIT` : '';
                const timeBadge = timeText ? `<span class="text-[9px] font-bold opacity-90 bg-white/70 px-2 py-1 rounded-lg border border-white/60">⏱️ ${escapeHTML(timeText)}</span>` : '';
                const targetBadge = item.targetFungsi && normalize(item.targetFungsi) !== normalize('Semua') ? `<span class="text-[9px] font-bold opacity-90 bg-white/70 px-2 py-1 rounded-lg border border-white/60">🎯 ${escapeHTML(item.targetFungsi)}</span>` : '';
                const hintTime = item.waktuMulai ? ` mulai pukul ${escapeHTML(item.waktuMulai)} WIT` : '';
                const statusText = todayActive ? 'Aktif Hari Ini' : (tomorrowActive ? 'Untuk Besok' : 'Agenda Minggu Ini');
                const badgeClass = getPengumumanBadgeClass(item.jenis);
                const alarmIcon = todayActive
                    ? '<span class="pengumuman-alarm inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-amber-100 text-amber-700 text-xl shadow-sm">🔔</span>'
                    : (tomorrowActive
                        ? '<span class="pengumuman-tomorrow-alarm inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-cyan-100 text-cyan-700 text-xl shadow-sm">⏰</span>'
                        : '<span class="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-white/70 text-slate-500 text-xl shadow-sm">📌</span>');
                const liveDot = todayActive
                    ? '<span class="pengumuman-dot-pulse inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5 align-middle"></span>'
                    : (tomorrowActive ? '<span class="pengumuman-dot-pulse inline-block w-2 h-2 rounded-full bg-cyan-500 mr-1.5 align-middle"></span>' : '');
                const todayHint = todayActive
                    ? `<div class="mt-3 p-2 rounded-xl bg-white/70 border border-amber-100 text-[10px] font-bold text-amber-700">Pengumuman ini aktif hari ini${hintTime}. Jangan sampai terlewat, ya.</div>`
                    : (tomorrowActive ? `<div class="mt-3 p-2 rounded-xl bg-white/70 border border-cyan-100 text-[10px] font-bold text-cyan-700">Pengumuman ini untuk besok${hintTime}. Boleh mulai disiapkan dari sekarang, ya.</div>` : '');
                const cardExtra = todayActive ? 'pengumuman-today-card ring-2 ring-amber-200' : (tomorrowActive ? 'pengumuman-tomorrow-card ring-2 ring-cyan-200' : '');

                return `
                    <div class="p-4 rounded-2xl border ${badgeClass} ${cardExtra}">
                        <div class="flex items-start gap-3">
                            <div class="shrink-0">${alarmIcon}</div>
                            <div class="min-w-0 flex-1">
                                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                    <span class="text-[9px] font-black uppercase tracking-widest">${liveDot}${escapeHTML(item.jenis || 'Informasi')} • ${statusText}</span>
                                    <div class="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                                        <span class="text-[9px] font-bold opacity-80">${escapeHTML(rangeText)}</span>
                                        ${timeBadge}
                                        ${targetBadge}
                                    </div>
                                </div>
                                <h3 class="font-black text-slate-900 text-sm uppercase tracking-tight mb-1">${escapeHTML(item.judul || 'Pengumuman')}</h3>
                                <p class="text-xs text-slate-600 leading-relaxed whitespace-pre-line">${linkifyText(item.isi || '')}</p>
                                ${todayHint}
                            </div>
                        </div>
                    </div>
                `;
            }).join('') + moreInfo;
            try { window.checkBerandaReminderSound && window.checkBerandaReminderSound({ source: 'pengumuman' }); } catch(e) {}
        };

        window.renderAdminPengumuman = function() {
            const listEl = document.getElementById('admin-pengumuman-list');
            const statEl = document.getElementById('admin-stat-pengumuman');
            if(statEl) statEl.innerText = `${(window.pengumumanData || []).length} Pengumuman`;
            if(!listEl) return;

            const list = [...(window.pengumumanData || [])].sort((a,b) => String(b.mulai || '').localeCompare(String(a.mulai || '')));
            if(list.length === 0) {
                listEl.innerHTML = '<div class="p-8 text-center text-slate-400 italic text-[9px] uppercase font-black">Belum ada pengumuman</div>';
                return;
            }

            listEl.innerHTML = list.map(item => {
                const badgeClass = getPengumumanBadgeClass(item.jenis);
                const statusInfo = getPengumumanStatusInfo(item);
                const rangeText = item.mulai && item.selesai ? `${formatDateIndo(item.mulai)} - ${formatDateIndo(item.selesai)}` : '-';
                const waktuText = item.waktuMulai ? ` • Mulai ${item.waktuMulai} WIT` : '';
                const targetText = item.targetFungsi && normalize(item.targetFungsi) !== normalize('Semua') ? ` • Untuk ${item.targetFungsi}` : ' • Untuk Semua';
                return `
                    <div class="p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-4 hover:bg-slate-50 ${statusInfo.cardClass}">
                        <div class="flex-1">
                            <div class="flex flex-wrap items-center gap-2 mb-2">
                                <span class="px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${badgeClass}">${escapeHTML(item.jenis || 'Informasi')}</span>
                                <span class="px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${statusInfo.className}">${escapeHTML(statusInfo.label)}</span>
                                <span class="text-[9px] font-bold text-slate-400 uppercase">${escapeHTML(rangeText + waktuText + targetText)}</span>
                            </div>
                            <h4 class="font-black text-slate-900 text-xs uppercase tracking-tight">${escapeHTML(item.judul || 'Pengumuman')}</h4>
                            <p class="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line">${linkifyText(item.isi || '')}</p>
                        </div>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <button onclick="window.editPengumuman('${escapeHTML(item.id)}')" class="px-3 py-2 bg-cyan-50 hover:bg-cyan-600 text-cyan-700 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors">Edit</button>
                            <button onclick="window.hapusPengumuman('${escapeHTML(item.id)}')" class="px-3 py-2 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors">Hapus</button>
                        </div>
                    </div>
                `;
            }).join('');
        };

        window.resetFormPengumuman = function() {
            const form = document.getElementById('form-pengumuman');
            if(form) form.reset();
            const editId = document.getElementById('pengumuman-edit-id');
            const submitBtn = document.getElementById('btn-submit-pengumuman');
            const resetBtn = document.getElementById('btn-reset-pengumuman');
            const today = getTodayKey();
            const mulai = document.getElementById('pengumuman-mulai');
            const selesai = document.getElementById('pengumuman-selesai');
            const waktuMulai = document.getElementById('pengumuman-waktu-mulai');
            const targetFungsi = document.getElementById('pengumuman-target-fungsi');
            if(editId) editId.value = '';
            if(submitBtn) submitBtn.innerText = '💾 Simpan Pengumuman';
            if(resetBtn) resetBtn.innerText = 'Reset';
            if(mulai) mulai.value = today;
            if(selesai) selesai.value = addDaysToKey(today, 7);
            if(waktuMulai) waktuMulai.value = '';
            if(targetFungsi) {
                if(isVerifierScopedMode() && getVerifierUnitLabel()) setPengumumanTargetValues(getVerifierUnitLabel());
                else window.setPengumumanTargetSemua();
            }
        };

        window.editPengumuman = function(id) {
            if(!canManageInfoBoards()) return window.showCustomAlert('Akses ditolak.');
            const target = (window.pengumumanData || []).find(p => String(p.id) === String(id));
            if(!target) return window.showCustomAlert('Pengumuman tidak ditemukan.');

            const editId = document.getElementById('pengumuman-edit-id');
            const judul = document.getElementById('pengumuman-judul');
            const jenis = document.getElementById('pengumuman-jenis');
            const mulai = document.getElementById('pengumuman-mulai');
            const selesai = document.getElementById('pengumuman-selesai');
            const waktuMulai = document.getElementById('pengumuman-waktu-mulai');
            const isi = document.getElementById('pengumuman-isi');
            const targetFungsi = document.getElementById('pengumuman-target-fungsi');
            const submitBtn = document.getElementById('btn-submit-pengumuman');
            const resetBtn = document.getElementById('btn-reset-pengumuman');

            if(editId) editId.value = target.id || '';
            if(judul) judul.value = target.judul || '';
            if(jenis) jenis.value = target.jenis || 'Informasi';
            if(mulai) mulai.value = target.mulai || getTodayKey();
            if(selesai) selesai.value = target.selesai || target.mulai || getTodayKey();
            if(waktuMulai) waktuMulai.value = target.waktuMulai || '';
            if(targetFungsi) setPengumumanTargetValues(target.targetFungsi || 'Semua');
            if(isi) isi.value = target.isi || '';
            if(submitBtn) submitBtn.innerText = '✏️ Simpan Perubahan';
            if(resetBtn) resetBtn.innerText = 'Batal Edit';

            const form = document.getElementById('form-pengumuman');
            if(form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        window.simpanPengumuman = async function(e) {
            e.preventDefault();
            if(!canManageInfoBoards()) return window.showCustomAlert('Akses ditolak. Fitur ini hanya untuk Admin Utama, Ketua Tim, atau Verifikator.');

            const editId = document.getElementById('pengumuman-edit-id')?.value || '';
            const existing = editId ? (window.pengumumanData || []).find(p => String(p.id) === String(editId)) : null;
            const isEdit = Boolean(editId && existing);
            const payload = {
                id: isEdit ? editId : makeLocalId('pengumuman'),
                judul: document.getElementById('pengumuman-judul')?.value.trim() || '',
                jenis: document.getElementById('pengumuman-jenis')?.value || 'Informasi',
                mulai: document.getElementById('pengumuman-mulai')?.value || getTodayKey(),
                selesai: document.getElementById('pengumuman-selesai')?.value || getTodayKey(),
                waktuMulai: document.getElementById('pengumuman-waktu-mulai')?.value || '',
                targetFungsi: getPengumumanTargetValues().join(', '),
                createdByName: window.currentUser?.nama || (window.isAdmin ? 'Administrator' : ''),
                createdByNip: window.currentUser?.nip || '',
                createdByRole: getCurrentRoleLabel(),
                createdByUnit: getVerifierUnitLabel() || '',
                isi: document.getElementById('pengumuman-isi')?.value.trim() || '',
                aktif: true,
                createdAt: existing?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdByName: window.currentUser?.nama || (window.isAdmin ? 'Administrator' : ''),
                createdByNip: window.currentUser?.nip || '',
                createdByRole: getCurrentRoleLabel(),
                createdByUnit: getVerifierUnitLabel() || ''
            };

            if(!payload.judul || !payload.isi) return window.showCustomAlert('Judul dan isi pengumuman wajib diisi.');
            if(payload.selesai < payload.mulai) return window.showCustomAlert('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');

            window.showLoader(true, 'Menyimpan Pengumuman...');
            try {
                await postToScript('save_pengumuman', payload);
                if(isEdit) {
                    window.pengumumanData = (window.pengumumanData || []).map(item => String(item.id) === String(payload.id) ? { ...item, ...payload } : item);
                } else {
                    window.pengumumanData = [payload, ...(window.pengumumanData || [])];
                }
                saveLocalPengumuman(window.pengumumanData);
                saveLocalCoreCache();
                window.renderPengumumanBoard();
                window.renderAdminPengumuman();
                window.resetFormPengumuman();
                window.showCustomAlert(isEdit ? 'Perubahan pengumuman berhasil disimpan.' : 'Pengumuman berhasil disimpan.');
            } catch(err) {
                window.showCustomAlert('Gagal menyimpan pengumuman: ' + err.message);
            } finally {
                window.showLoader(false);
            }
        };

        window.hapusPengumuman = function(id) {
            if(!canManageInfoBoards()) return window.showCustomAlert('Akses ditolak.');
            const target = (window.pengumumanData || []).find(p => String(p.id) === String(id));
            if(!target) return;

            window.showCustomConfirm(`Hapus pengumuman "${target.judul}"?`, async () => {
                window.showLoader(true, 'Menghapus Pengumuman...');
                try {
                    await postToScript('delete_pengumuman', { id });
                } catch(_) {}
                window.pengumumanData = (window.pengumumanData || []).filter(p => String(p.id) !== String(id));
                saveLocalPengumuman(window.pengumumanData);
                saveLocalCoreCache();
                window.renderPengumumanBoard();
                window.renderAdminPengumuman();
                window.showLoader(false);
            });
        };

        function getAgendaPegawaiValue(p) {
            return String(p?.nip || p?.nama || '').trim();
        }

        function getAgendaPegawaiIdentityKey(p) {
            const nipKey = normalize(p?.nip || '');
            if(nipKey) return 'nip:' + nipKey;
            return 'nama:' + normalize(`${p?.nama || ''} ${p?.lab || ''}`);
        }

        function uniqueAgendaPegawaiRows(rows) {
            const map = new Map();
            (rows || []).forEach(p => {
                if(!p || (!p.nama && !p.nip)) return;
                const key = getAgendaPegawaiIdentityKey(p);
                if(key && !map.has(key)) map.set(key, p);
            });
            return Array.from(map.values());
        }

        function uniqueAgendaTextList(raw) {
            const seen = new Set();
            return String(raw || '')
                .split(/[,;|]/)
                .map(s => s.trim())
                .filter(Boolean)
                .filter(item => {
                    const key = normalize(item);
                    if(!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
        }

        function findAgendaPegawaiByValue(value, rows = getAgendaCandidatePegawaiRows()) {
            const valueNorm = normalize(value);
            return (rows || []).find(p =>
                normalize(getAgendaPegawaiValue(p)) === valueNorm ||
                normalize(p?.nip || '') === valueNorm ||
                normalize(p?.nama || '') === valueNorm
            );
        }

        function uniqueAgendaValues(values) {
            const seen = new Set();
            const out = [];
            (values || []).forEach(v => {
                const text = String(v || '').trim();
                const key = normalize(text);
                if(!text || !key || seen.has(key)) return;
                seen.add(key);
                out.push(text);
            });
            return out;
        }

        function getAgendaSelectedSet() {
            // Sumber pilihan utama adalah state visual agendaSelectedNips.
            // Jangan membaca selectedOptions dari hidden select saat render, karena hidden select berisi pilihan lama.
            // Jika dibaca ulang, tombol uncheck dan Bersihkan akan terlihat tidak berfungsi.
            const set = new Set((window.agendaSelectedNips || []).map(v => String(v || '').trim()).filter(Boolean));
            window.agendaSelectedNips = Array.from(set);
            return set;
        }

        function getAgendaSelectedPegawai() {
            const selected = getAgendaSelectedSet();
            return (window.masterPegawai || []).filter(p => selected.has(getAgendaPegawaiValue(p)));
        }

        function syncAgendaHiddenSelect(rows, selectedSet) {
            const select = document.getElementById('agenda-peserta');
            if(!select) return;
            select.innerHTML = rows.map(p => {
                const value = getAgendaPegawaiValue(p);
                const label = `${p.nama || '-'}${p.lab ? ' • ' + p.lab : ''}${p.nip ? ' • ' + p.nip : ''}`;
                return `<option value="${escapeHTML(value)}" ${selectedSet.has(value) ? 'selected' : ''}>${escapeHTML(label)}</option>`;
            }).join('');

            // Pastikan DOM selected benar-benar sinkron untuk kebutuhan submit/form browser.
            Array.from(select.options).forEach(opt => {
                opt.selected = selectedSet.has(String(opt.value || '').trim());
            });
        }

        function renderAgendaSelectedSummary(rows, selectedSet) {
            const el = document.getElementById('agenda-selected-summary');
            if(!el) return;
            const selectedPegawai = rows.filter(p => selectedSet.has(getAgendaPegawaiValue(p)));
            if(!selectedPegawai.length) {
                el.innerHTML = '<span class="agenda-chip text-slate-400">Belum ada personil dipilih</span>';
                return;
            }

            const chips = selectedPegawai.slice(0, 10).map(p => {
                const value = getAgendaPegawaiValue(p).replaceAll("'", "\\'");
                return `<span class="agenda-chip">${escapeHTML((p.nama || '-').split(' ')[0])}<button type="button" onclick="window.toggleAgendaPersonil('${value}')" class="text-rose-500 font-black">×</button></span>`;
            }).join('');

            const more = selectedPegawai.length > 10 ? `<span class="agenda-chip">+${selectedPegawai.length - 10} lainnya</span>` : '';
            el.innerHTML = `<span class="agenda-chip bg-emerald-50 text-emerald-700">${selectedPegawai.length} dipilih</span>` + chips + more;
        }

        window.toggleAgendaPersonil = function(value) {
            const selected = getAgendaSelectedSet();
            const safeValue = String(value || '').trim();
            if(!safeValue) return;
            if(selected.has(safeValue)) selected.delete(safeValue);
            else selected.add(safeValue);
            window.agendaSelectedNips = Array.from(selected);
            window.renderAgendaPegawaiOptions();
        };

        window.selectAgendaGroup = function(groupName) {
            const rows = getAgendaCandidatePegawaiRows();
            if(groupName === 'clear') {
                window.agendaSelectedNips = [];
                const search = document.getElementById('agenda-personil-search');
                if(search) search.value = '';
                const select = document.getElementById('agenda-peserta');
                if(select) Array.from(select.options || []).forEach(opt => opt.selected = false);
                window.renderAgendaPegawaiOptions({ forceShow: false });
                return;
            }

            const selected = getAgendaSelectedSet();
            const targets = groupName === 'all'
                ? rows
                : rows.filter(p => labMatches(p.lab, groupName));

            targets.forEach(p => {
                const value = getAgendaPegawaiValue(p);
                if(value) selected.add(value);
            });

            window.agendaSelectedNips = Array.from(selected);
            const search = document.getElementById('agenda-personil-search');
            if(search) search.value = groupName === 'all' ? '' : groupName;
            window.renderAgendaPegawaiOptions({ forceShow: true });
        };

        function updateAgendaGroupButtons() {
            const selected = getAgendaSelectedSet();
            const rows = getAgendaCandidatePegawaiRows();
            const groups = ['all', 'Kimia OBA', 'Kimia Pangan', 'Kimia Obnaz', 'Kimia Kosmetik', 'Mikrobiologi'];

            groups.forEach(groupName => {
                const btn = document.querySelector(`[data-agenda-group="${groupName}"]`);
                if(!btn) return;

                const groupRows = groupName === 'all'
                    ? rows
                    : rows.filter(p => labMatches(p.lab, groupName));

                const total = groupRows.length;
                const selectedCount = groupRows.filter(p => selected.has(getAgendaPegawaiValue(p))).length;

                btn.classList.remove('selected', 'partial');
                btn.removeAttribute('title');

                if(total > 0 && selectedCount === total) {
                    btn.classList.add('selected');
                    btn.title = `${selectedCount}/${total} personil sudah dipilih`;
                } else if(selectedCount > 0) {
                    btn.classList.add('partial');
                    btn.title = `${selectedCount}/${total} personil sudah dipilih`;
                } else if(total > 0) {
                    btn.title = `Belum dipilih (${total} personil)`;
                }
            });
        }

        // Khusus pembuatan Agenda: Ketua Tim/Verifikator boleh memilih seluruh pegawai,
        // tidak dibatasi unit binaan. Pembatasan unit tetap berlaku hanya untuk pemantauan/review jurnal.
        function getAgendaCandidatePegawaiRows() {
            // Untuk agenda kegiatan, daftar kandidat dibuat unik agar peserta tidak
            // terhitung ganda bila data pegawai pernah tersimpan dobel di cache/Sheet.
            return uniqueAgendaPegawaiRows([...(window.masterPegawai || [])]
                .filter(p => p && (p.nama || p.nip)));
        }

        window.renderAgendaPegawaiOptions = function(options = {}) {
            const listEl = document.getElementById('agenda-personil-list');
            const rows = getAgendaCandidatePegawaiRows()
                .sort((a,b) => {
                    const labCompare = String(a.lab || '').localeCompare(String(b.lab || ''), 'id', { sensitivity: 'base' });
                    if(labCompare !== 0) return labCompare;
                    return String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' });
                });

            const selected = getAgendaSelectedSet();
            syncAgendaHiddenSelect(rows, selected);
            renderAgendaSelectedSummary(rows, selected);
            updateAgendaGroupButtons();

            if(!listEl) return;

            const query = normalize(document.getElementById('agenda-personil-search')?.value || '');
            let visibleRows = rows;

            if(query) {
                visibleRows = rows.filter(p => {
                    const haystack = normalize(`${p.nama || ''} ${p.nip || ''} ${p.lab || ''} ${p.status || ''}`);
                    const nameWordMatch = String(p.nama || '').split(/\s+/).some(part => normalize(part).startsWith(query));
                    return haystack.includes(query) || nameWordMatch;
                });
            } else if(!selected.size && !options.forceShow) {
                listEl.innerHTML = '<div class="md:col-span-2 p-5 rounded-xl bg-white border border-slate-100 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">Pilih tombol fungsi atau ketik nama personil untuk menampilkan daftar.</div>';
                return;
            }

            // Saat tanpa pencarian tetapi sudah ada pilihan, tampilkan personil terpilih dahulu agar tidak memanjang.
            if(!query && selected.size) {
                visibleRows = rows.filter(p => selected.has(getAgendaPegawaiValue(p))).slice(0, 80);
            } else {
                visibleRows = visibleRows.slice(0, 80);
            }

            if(!visibleRows.length) {
                listEl.innerHTML = '<div class="md:col-span-2 p-5 rounded-xl bg-white border border-slate-100 text-center text-rose-400 text-[10px] font-black uppercase tracking-widest">Personil tidak ditemukan.</div>';
                return;
            }

            listEl.innerHTML = visibleRows.map(p => {
                const value = getAgendaPegawaiValue(p);
                const isSelected = selected.has(value);
                const safeValue = value.replaceAll("'", "\\'");
                return `
                    <button type="button" onclick="window.toggleAgendaPersonil('${safeValue}')" class="agenda-personil-card ${isSelected ? 'selected' : ''}">
                        <div class="flex items-start gap-3">
                            <span class="agenda-personil-check">✓</span>
                            <span class="min-w-0 flex-1">
                                <span class="block text-[10px] font-black text-slate-800 uppercase leading-snug">${escapeHTML(p.nama || '-')}</span>
                                <span class="block text-[9px] font-bold text-cyan-700 mt-1">${escapeHTML(p.lab || 'Fungsi belum terisi')}</span>
                                <span class="block text-[8px] font-bold text-slate-400 mt-1">${escapeHTML(p.nip || '-')} ${p.status ? '• ' + escapeHTML(p.status) : ''}</span>
                            </span>
                        </div>
                    </button>
                `;
            }).join('');
        };

        window.resetFormAgenda = function() {
            const form = document.getElementById('form-agenda');
            if(form) form.reset();
            const editId = document.getElementById('agenda-edit-id');
            const tanggal = document.getElementById('agenda-tanggal');
            const submitBtn = document.getElementById('btn-submit-agenda');
            const resetBtn = document.getElementById('btn-reset-agenda');
            if(editId) editId.value = '';
            if(tanggal) tanggal.value = getTodayKey();
            if(submitBtn) submitBtn.innerText = '💾 Simpan Agenda';
            if(resetBtn) resetBtn.innerText = 'Reset';
            window.agendaSelectedNips = [];
            const search = document.getElementById('agenda-personil-search');
            if(search) search.value = '';
            window.renderAgendaPegawaiOptions();
        };

        window.simpanAgenda = async function(e) {
            e.preventDefault();
            if(!canManageInfoBoards()) return window.showCustomAlert('Akses ditolak. Fitur ini hanya untuk Admin Utama, Ketua Tim, atau Verifikator.');

            const selectedNips = uniqueAgendaValues(Array.from(getAgendaSelectedSet()).filter(Boolean));
            if(!selectedNips.length) return window.showCustomAlert('Pilih minimal satu personil atau satu fungsi yang wajib ikut agenda.');

            const editId = document.getElementById('agenda-edit-id')?.value || '';
            const existingAgenda = editId ? (window.agendaData || []).find(a => String(a.id) === String(editId)) : null;
            const agendaCandidateRows = getAgendaCandidatePegawaiRows();
            const selectedPegawai = selectedNips.map(v => findAgendaPegawaiByValue(v, agendaCandidateRows)).filter(Boolean);
            const pesertaNipList = uniqueAgendaValues(selectedPegawai.map(p => p.nip || getAgendaPegawaiValue(p)));
            const pesertaNamaList = uniqueAgendaValues(selectedPegawai.map(p => p.nama || getAgendaPegawaiValue(p)));
            const payload = {
                id: editId || makeLocalId('agenda'),
                judul: document.getElementById('agenda-judul')?.value.trim() || '',
                jenis: document.getElementById('agenda-jenis')?.value || 'Agenda',
                tanggal: document.getElementById('agenda-tanggal')?.value || getTodayKey(),
                waktuMulai: document.getElementById('agenda-waktu')?.value || '',
                lokasi: document.getElementById('agenda-lokasi')?.value.trim() || '',
                keterangan: document.getElementById('agenda-keterangan')?.value.trim() || '',
                pesertaNip: pesertaNipList.join(', '),
                pesertaNama: pesertaNamaList.join(', '),
                aktif: true,
                createdAt: existingAgenda?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdByName: window.currentUser?.nama || (window.isAdmin ? 'Administrator' : ''),
                createdByNip: window.currentUser?.nip || '',
                createdByRole: getCurrentRoleLabel(),
                createdByUnit: getVerifierUnitLabel() || ''
            };
            if(!payload.judul) return window.showCustomAlert('Judul agenda wajib diisi.');

            window.showLoader(true, editId ? 'Menyimpan Perubahan Agenda...' : 'Menyimpan Agenda...');
            try {
                await postToScript('save_agenda', payload);
                const exists = (window.agendaData || []).some(a => String(a.id) === String(payload.id));
                window.agendaData = exists
                    ? (window.agendaData || []).map(a => String(a.id) === String(payload.id) ? { ...a, ...payload } : a)
                    : [payload, ...(window.agendaData || [])];
                saveLocalCoreCache();
                window.renderAgendaSaya();
                window.renderAdminAgenda();
                window.resetFormAgenda();
                window.showCustomAlert(editId ? 'Perubahan agenda kegiatan berhasil disimpan.' : 'Agenda kegiatan berhasil disimpan.');
            } catch(err) {
                window.showCustomAlert('Gagal menyimpan agenda: ' + err.message);
            } finally {
                window.showLoader(false);
            }
        };

        window.renderAdminAgenda = function() {
            const listEl = document.getElementById('admin-agenda-list');
            const statEl = document.getElementById('admin-stat-agenda');
            if(statEl) statEl.innerText = `${(window.agendaData || []).length} Agenda`;
            if(!listEl) return;
            const list = [...(window.agendaData || [])].sort(sortAgendaInteraktif);
            if(!list.length) {
                listEl.innerHTML = '<div class="p-8 text-center text-slate-400 italic text-[9px] uppercase font-black">Belum ada agenda kegiatan</div>';
                return;
            }
            listEl.innerHTML = list.map(item => {
                const pesertaRaw = item.pesertaNama || item.pesertaNip || '-';
                const pesertaArr = uniqueAgendaTextList(pesertaRaw);
                const peserta = pesertaArr.length > 5 ? `${pesertaArr.slice(0, 5).join(', ')} +${pesertaArr.length - 5} lainnya` : (pesertaArr.join(', ') || '-');
                const waktu = item.waktuMulai ? ` • ${item.waktuMulai} WIT` : ' • Waktu belum diisi';
                const info = getAgendaReminderInfo(item);
                const isArchived = ['berlalu', 'nonaktif'].includes(info.status);
                const adminCardState = isArchived ? 'opacity-70 bg-slate-50' : '';
                const reminderLabel = info.status === '24jam'
                    ? '<span class="px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border-amber-200 animate-pulse">🔔 Pengingat 24 Jam</span>'
                    : (info.status === 'mulai' ? '<span class="px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest bg-rose-50 text-rose-700 border-rose-200 animate-pulse">🚨 Mulai Sekarang</span>' : `<span class="px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${info.cardClass}">${escapeHTML(info.label)}</span>`);
                return `
                    <div class="p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-4 hover:bg-slate-50 ${info.ringClass} ${adminCardState}">
                        <div class="flex-1">
                            <div class="flex flex-wrap items-center gap-2 mb-2">
                                <span class="px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest bg-cyan-50 text-cyan-700 border-cyan-200">${escapeHTML(item.jenis || 'Agenda')}</span>
                                ${reminderLabel}
                                <span class="text-[9px] font-bold text-slate-400 uppercase">${escapeHTML(formatDateIndo(item.tanggal) + waktu)}</span>
                            </div>
                            <h4 class="font-black text-slate-900 text-xs uppercase tracking-tight">${escapeHTML(item.judul || 'Agenda Kegiatan')}</h4>
                            <p class="text-[10px] text-slate-500 mt-1 font-bold">Lokasi: ${linkifyText(item.lokasi || '-')}</p>
                            <p class="text-[10px] text-slate-500 mt-1 font-bold">Wajib ikut: ${escapeHTML(peserta)}</p>
                            <p class="mt-2 p-2 rounded-xl bg-slate-50 text-[10px] text-slate-600 font-bold leading-relaxed">${escapeHTML(info.hint)}</p>
                            ${item.keterangan ? `<p class="text-xs text-slate-600 mt-2 leading-relaxed whitespace-pre-line">${linkifyText(item.keterangan)}</p>` : ''}
                        </div>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <button onclick="window.editAgenda('${escapeHTML(item.id)}')" class="px-3 py-2 bg-cyan-50 hover:bg-cyan-600 text-cyan-700 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors">Edit</button>
                            <button onclick="window.hapusAgenda('${escapeHTML(item.id)}')" class="px-3 py-2 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors">Hapus</button>
                        </div>
                    </div>
                `;
            }).join('');
        };

        window.editAgenda = function(id) {
            if(!canManageInfoBoards()) return window.showCustomAlert('Akses ditolak.');
            const target = (window.agendaData || []).find(a => String(a.id) === String(id));
            if(!target) return window.showCustomAlert('Agenda tidak ditemukan.');

            window.renderAgendaPegawaiOptions();

            const editId = document.getElementById('agenda-edit-id');
            const judul = document.getElementById('agenda-judul');
            const jenis = document.getElementById('agenda-jenis');
            const tanggal = document.getElementById('agenda-tanggal');
            const waktu = document.getElementById('agenda-waktu');
            const lokasi = document.getElementById('agenda-lokasi');
            const ket = document.getElementById('agenda-keterangan');
            const peserta = document.getElementById('agenda-peserta');
            const submitBtn = document.getElementById('btn-submit-agenda');
            const resetBtn = document.getElementById('btn-reset-agenda');

            if(editId) editId.value = target.id || '';
            if(judul) judul.value = target.judul || '';
            if(jenis) jenis.value = target.jenis || 'Agenda';
            if(tanggal) tanggal.value = target.tanggal || getTodayKey();
            if(waktu) waktu.value = target.waktuMulai || '';
            if(lokasi) lokasi.value = target.lokasi || '';
            if(ket) ket.value = target.keterangan || '';

            const selected = uniqueAgendaValues(String(target.pesertaNip || '').split(/[,;|]/).map(s => s.trim()).filter(Boolean));
            window.agendaSelectedNips = selected;
            const search = document.getElementById('agenda-personil-search');
            if(search) search.value = '';
            window.renderAgendaPegawaiOptions({ forceShow: true });

            if(submitBtn) submitBtn.innerText = '✏️ Simpan Perubahan Agenda';
            if(resetBtn) resetBtn.innerText = 'Batal Edit';

            const form = document.getElementById('form-agenda');
            if(form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        window.hapusAgenda = function(id) {
            if(!canManageInfoBoards()) return window.showCustomAlert('Akses ditolak.');
            const target = (window.agendaData || []).find(a => String(a.id) === String(id));
            if(!target) return;
            window.showCustomConfirm(`Hapus agenda "${target.judul}"?`, async () => {
                window.showLoader(true, 'Menghapus Agenda...');
                try { await postToScript('delete_agenda', { id }); } catch(_) {}
                window.agendaData = (window.agendaData || []).filter(a => String(a.id) !== String(id));
                saveLocalCoreCache();
                window.renderAgendaSaya();
                window.renderAdminAgenda();
                window.showLoader(false);
            });
        };

        window.renderAdminDashboard = function() {
            if(!canAccessAdminPanel()) return;
            applyAdminRoleAccess && applyAdminRoleAccess();

            if(!window.isAdmin) {
                // Ketua Tim/Verifikator memakai panel terbatas sesuai unit binaan: Dashboard Jurnal, Dashboard Lembur, Rekap Jurnal Pegawai, Pengumuman, dan Agenda.
                const currentVisible = ['analitik', 'lembur', 'rekap', 'pengumuman', 'agenda'].find(id => {
                    const content = document.getElementById('admin-content-' + id);
                    return content && !content.classList.contains('hidden');
                });
                window.switchAdminTab(currentVisible || 'analitik');
                return;
            }

            const countEl = document.getElementById('admin-stat-pegawai');
            const body = document.getElementById('admin-pegawai-body');
            if(countEl) countEl.innerText = `${window.masterPegawai.length} Pegawai`;
            if(!body) return;
            body.innerHTML = '';

            if(window.masterPegawai.length === 0) {
                body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400 italic text-[9px] uppercase font-black">Belum ada data pegawai</td></tr>';
                return;
            }

            const sorted = [...window.masterPegawai].sort((a,b) => a.nama.localeCompare(b.nama));
            sorted.forEach(p => {
                body.innerHTML += `
                    <tr class="hover:bg-slate-50">
                        <td class="p-4 text-center sm:text-left">
                            <div class="font-black uppercase text-slate-800">${escapeHTML(p.nama)}</div>
                            <div class="text-[9px] text-slate-400 font-bold uppercase">${escapeHTML(p.lab || '-')} • ${escapeHTML(p.status || '-')}</div>
                        </td>
                        <td class="p-4 font-mono text-[10px] text-center sm:text-left">${escapeHTML(p.nip || '-')}</td>
                        <td class="p-4 text-[10px] text-center sm:text-left font-black uppercase ${isReviewerRoleValue(p.peran) ? 'text-cyan-700' : 'text-slate-400'}">${escapeHTML(p.peran || 'Pegawai')}</td>
                        <td class="p-4 text-center">
                            <button onclick="window.hapusPegawai('${escapeHTML(p.id || p.nip || p.nama)}')" class="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-[8px] font-black uppercase hover:bg-rose-600 hover:text-white transition-colors">Hapus</button>
                        </td>
                    </tr>
                `;
            });

            try {
                window.renderAdminAllTable();
            } catch(err) {
                console.error('Rekap semua pegawai gagal render:', err);
                const bodyErr = document.getElementById('admin-all-body');
                if(bodyErr) bodyErr.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-rose-400 italic text-xs">Rekap belum dapat ditampilkan. Silakan klik Sinkron Data / refresh.</td></tr>';
            }

            try {
                window.renderAdminAnalytics();
            } catch(err) {
                console.error('Dashboard analitik admin gagal render:', err);
            }
        };

        window.tambahPegawai = async function(e) {
            e.preventDefault();
            if(!window.isAdmin) return window.showCustomAlert('Akses admin diperlukan.');

            const payload = {
                id: makeLocalId('pegawai'),
                nama: document.getElementById('add-nama')?.value.trim() || '',
                nip: document.getElementById('add-nip')?.value.trim() || '',
                status: document.getElementById('add-status')?.value || 'PNS',
                lab: document.getElementById('add-lab')?.value || '',
                peran: document.getElementById('add-peran')?.value || 'Pegawai',
                cakupanUnit: document.getElementById('add-cakupan-unit')?.value.trim() || '',
                createdAt: new Date().toISOString(),
                originalDate: window.editingJurnalOriginal?.date || date,
                originalName: window.editingJurnalOriginal?.name || window.currentUser.nama,
                originalDesc: window.editingJurnalOriginal?.desc || desc
            };

            if(!payload.nama || !payload.nip) return window.showCustomAlert('Nama dan NIP wajib diisi.');
            if(window.masterPegawai.some(p => normalize(p.nip) === normalize(payload.nip))) {
                return window.showCustomAlert('NIP sudah terdaftar.');
            }

            window.showLoader(true, 'Menyimpan Pegawai...');
            try {
                await postToScript('add_pegawai', payload);
                window.masterPegawai.push(payload);
                window.populateLoginDropdown();
                window.renderAdminDashboard();
                e.target.reset();
                window.showCustomAlert('Data pegawai berhasil ditambahkan.');
            } catch(err) {
                console.error(err);
                window.showCustomAlert('Gagal menambah pegawai: ' + err.message);
            } finally {
                window.showLoader(false);
            }
        };

        window.hapusPegawai = function(identifier) {
            if(!window.isAdmin) return window.showCustomAlert('Akses admin diperlukan.');
            const target = window.masterPegawai.find(p => [p.id, p.nip, p.nama].some(v => normalize(v) === normalize(identifier)));
            if(!target) return window.showCustomAlert('Data pegawai tidak ditemukan.');
            window.showCustomConfirm(`Hapus pegawai ${target.nama}?`, async () => {
                window.showLoader(true, 'Menghapus Pegawai...');
                try {
                    await postToScript('delete_pegawai', { id: target.id, nip: target.nip, nama: target.nama });
                    window.masterPegawai = window.masterPegawai.filter(p => p !== target);
                    window.populateLoginDropdown();
                    window.renderAdminDashboard();
                } catch(err) {
                    window.showCustomAlert('Gagal menghapus pegawai: ' + err.message);
                } finally {
                    window.showLoader(false);
                }
            });
        };

        function hitungDurasiMenit(start, end) {
            if(!start || !end) return 0;
            const [sh, sm] = start.split(':').map(Number);
            const [eh, em] = end.split(':').map(Number);
            if([sh, sm, eh, em].some(Number.isNaN)) return 0;
            let startMin = sh * 60 + sm;
            let endMin = eh * 60 + em;
            if(endMin < startMin) endMin += 24 * 60;
            return Math.max(0, endMin - startMin);
        }

        function formatDurasi(start, end, fallback = '') {
            let total = hitungDurasiMenit(start, end);

            if(total <= 0) {
                const rawFallback = String(fallback || '').trim();
                if(rawFallback) {
                    const match = rawFallback.replace(',', '.').match(/\d+(?:\.\d+)?/);
                    const n = match ? Number(match[0]) : 0;
                    if(!Number.isNaN(n) && n > 0) total = Math.round(n * 60);
                }
            }

            if(total <= 0) return '-';

            // Logika pembulatan form verifikasi lembur:
            // durasi > 0 dan < 2 jam = 1 jam; durasi >= 2 jam = 2 jam. Menit tidak ditampilkan.
            return total >= 120 ? '2 JAM' : '1 JAM';
        }

        function downloadXls(filename, tableHtml) {
            const html = `
                <html><head><meta charset="UTF-8"></head><body>
                ${tableHtml}
                </body></html>
            `;
            const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        function formatBulanIndonesia(monthValue) {
            if(!monthValue) return '-';
            const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            const [year, month] = monthValue.split('-').map(Number);
            if(!year || !month || month < 1 || month > 12) return monthValue;
            return `${bulan[month - 1]} ${year}`;
        }

        function getCurrentUserLab() {
            if(window.currentUser?.lab) return window.currentUser.lab;
            const found = window.masterPegawai.find(p =>
                normalize(p.nip) === normalize(window.currentUser?.nip) ||
                normalize(p.nama) === normalize(window.currentUser?.nama)
            );
            return found?.lab || '';
        }

        function getKetuaTimByLab(lab) {
            const labNorm = normalize(lab);
            // Dibuat menggunakan includes agar tetap cocok untuk variasi seperti
            // "Lab Mikrobiologi", "Laboratorium Mikrobiologi", atau "Kimia Pangan".
            const isRosanaTeam = labNorm.includes('mikrobiologi') || labNorm.includes('pangan');

            if(isRosanaTeam) {
                return {
                    nama: 'Rosana Anna Ashari, S.Farm, Apt',
                    sapaan: 'Ibu Rosana',
                    nip: '198801152012122001',
                    jabatan: 'Ketua Tim Kerja Pengujian Pangan dan MBM',
                    wa: '6285729547090'
                };
            }

            return {
                nama: 'Imam Taufik, S. Farm., Apt., M.Farm.',
                sapaan: 'Bapak Imam',
                nip: '197907172003121001',
                jabatan: 'Ketua Tim Kerja Pengujian Sediaan Farmasi',
                wa: '6281388037000'
            };
        }

        function getSalamWaktu() {
            const hour = new Date().getHours();
            if(hour >= 4 && hour < 11) return 'Selamat pagi';
            if(hour >= 11 && hour < 15) return 'Selamat siang';
            if(hour >= 15 && hour < 18) return 'Selamat sore';
            return 'Selamat malam';
        }

        function buildKetuaTimWaMessage(payload) {
            const ketuaTim = getKetuaTimByLab(payload.lab || getCurrentUserLab());
            const isLembur = !!payload.isLembur;
            const sapaan = ketuaTim.sapaan || ketuaTim.nama || 'Bapak/Ibu';

            const lines = [
                `${getSalamWaktu()}, ${sapaan}.`,
                ''
            ];

            if(isLembur) {
                const waktu = `${payload.start || '-'} - ${payload.end || '-'}`;
                const durasi = formatDurasi(payload.start, payload.end, payload.lamaLembur);

                lines.push('Mohon izin menyampaikan kegiatan lembur yang sudah saya input melalui ARIKA untuk dapat dicek dan diverifikasi apabila berkenan.');
                lines.push('');
                lines.push(`Nama: ${payload.name || '-'}`);
                lines.push(`NIP: ${payload.nip || '-'}`);
                lines.push(`Laboratorium/Fungsi: ${payload.lab || '-'}`);
                lines.push(`Tanggal: ${formatHariTanggal(payload.date)}`);
                lines.push(`Kategori: ${payload.cat || '-'}`);
                lines.push('Jenis kegiatan: Lembur');
                lines.push(`Status akhir: ${payload.status || '-'}`);
                lines.push(`Waktu lembur: ${waktu}`);
                lines.push(`Durasi: ${durasi}`);
                lines.push(`No/Tanggal Surat Tugas: ${payload.suratTugas || '-'}`);
            } else {
                lines.push('Mohon izin menyampaikan kegiatan harian yang sudah saya input melalui ARIKA sebagai laporan aktivitas hari ini.');
                lines.push('');
                lines.push(`Nama: ${payload.name || '-'}`);
                lines.push(`NIP: ${payload.nip || '-'}`);
                lines.push(`Laboratorium/Fungsi: ${payload.lab || '-'}`);
                lines.push(`Tanggal: ${formatHariTanggal(payload.date)}`);
                lines.push(`Kategori: ${payload.cat || '-'}`);
                lines.push('Jenis kegiatan: Kegiatan harian');
                lines.push(`Status akhir: ${payload.status || '-'}`);
            }

            lines.push('');
            lines.push('Uraian kegiatan:');
            lines.push(`${payload.desc || '-'}`);
            lines.push('');
            lines.push('Terima kasih banyak atas perhatian dan arahannya.');
            lines.push('ARIKA - BPOM Ambon');

            return lines.join('\n');
        }

        // --- 💬 BANTUAN WHATSAPP ADMIN UTAMA ARIKA ---
        const ADMIN_ARIKA_WA = '6282220218987';

        function getActiveViewNameForHelp() {
            const activeView = Array.from(document.querySelectorAll('.view-section'))
                .find(section => !section.classList.contains('hidden'));
            if(!activeView) return 'Belum terdeteksi';
            return activeView.id.replace('view-', '').replaceAll('-', ' ');
        }

        function buildArikaHelpWaMessage() {
            const user = window.currentUser || {};
            const nama = user.nama || 'Belum login / belum memilih akun';
            const nip = user.nip || '-';
            const lab = user.lab || getCurrentUserLab?.() || '-';
            const role = window.isAdmin ? 'Administrator' : (window.currentUser ? 'Personil Pegawai' : 'Belum login');
            const halaman = getActiveViewNameForHelp();
            let waktuAkses = '-';

            try {
                waktuAkses = new Date().toLocaleString('id-ID', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } catch(err) {
                waktuAkses = new Date().toString();
            }

            return [
                `${getSalamWaktu()}, Admin ARIKA.`,
                '',
                'Mohon izin, saya membutuhkan bantuan terkait penggunaan ARIKA.',
                '',
                `Nama: ${nama}`,
                `NIP: ${nip}`,
                `Laboratorium/Fungsi: ${lab || '-'}`,
                `Akses sebagai: ${role}`,
                `Halaman terakhir: ${halaman}`,
                `Waktu akses: ${waktuAkses}`,
                '',
                'Kendala/pertanyaan saya:',
                '[Silakan tuliskan kendala atau pertanyaan di sini]',
                '',
                'Terima kasih banyak atas bantuannya.'
            ].join('\n');
        }

        window.openArikaHelpWhatsApp = function() {
            const message = buildArikaHelpWaMessage();
            const waUrl = `https://wa.me/${ADMIN_ARIKA_WA}?text=${encodeURIComponent(message)}`;
            window.open(waUrl, '_blank', 'noopener,noreferrer');
        };

        function showKetuaTimWaPrompt(payload) {
            if(!payload || !window.currentUser || window.isAdmin) return;

            const ketuaTim = getKetuaTimByLab(payload.lab || getCurrentUserLab());
            if(!ketuaTim.wa) return;

            const oldPrompt = document.getElementById('wa-notif-prompt');
            if(oldPrompt) oldPrompt.remove();

            const target = document.getElementById('msg-success') || document.getElementById('form-arika');
            if(!target || !target.parentNode) return;

            const message = buildKetuaTimWaMessage(payload);
            const waUrl = `https://wa.me/${ketuaTim.wa}?text=${encodeURIComponent(message)}`;

            const wrapper = document.createElement('div');
            wrapper.id = 'wa-notif-prompt';
            wrapper.className = 'mt-4 text-center animate-fade';
            wrapper.innerHTML = `
                <button type="button" id="btn-send-wa-ketua-tim" class="w-full sm:w-auto px-5 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-colors">
                    📲 Kirim WhatsApp ke Ketua Tim
                </button>
            `;

            target.parentNode.insertBefore(wrapper, target.nextSibling);

            const btn = document.getElementById('btn-send-wa-ketua-tim');
            if(btn) {
                btn.addEventListener('click', () => {
                    window.open(waUrl, '_blank', 'noopener,noreferrer');
                });
            }
        }

        // ==========================================
        // DASHBOARD PEGAWAI READ-ONLY
        // ==========================================
        function getPegawaiDashboardPeriodLabel(monthVal) {
            return monthVal ? formatBulanIndonesia(monthVal) : 'Semua Periode';
        }

        function getMyJurnalRowsForDashboard(monthVal = '') {
            return (window.arikaData || [])
                .filter(d => personMatchesRow(d, window.currentUser))
                .filter(d => !monthVal || String(d.date || '').startsWith(monthVal))
                .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || getJurnalSortTime(b) - getJurnalSortTime(a));
        }

        function getUnitRowsForPegawaiDashboard(monthVal = '') {
            const userLab = getCurrentUserLab ? getCurrentUserLab() : (window.currentUser?.lab || '');
            return (window.arikaData || [])
                .filter(d => userLab ? labMatches(d.lab, userLab) : false)
                .filter(d => !monthVal || String(d.date || '').startsWith(monthVal));
        }

        function percentText(part, total) {
            if(!total) return '0%';
            return `${Math.round((part / total) * 100)}%`;
        }

        function buildDashboardTimeline(rows, monthVal = '') {
            if(monthVal) {
                const [year, month] = monthVal.split('-').map(Number);
                const daysInMonth = new Date(year, month, 0).getDate();
                const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
                const values = Array(daysInMonth).fill(0);
                (rows || []).forEach(row => {
                    const day = Number(String(row.date || '').slice(8, 10));
                    if(day >= 1 && day <= daysInMonth) values[day - 1] += 1;
                });
                return { labels, values, note: `Harian pada ${formatBulanIndonesia(monthVal)}` };
            }

            const end = getCurrentMonth();
            const months = [];
            for(let i = 11; i >= 0; i--) months.push(getMonthKeyOffset(end, -i));
            const totals = Object.fromEntries(months.map(m => [m, 0]));
            (rows || []).forEach(row => {
                const key = String(row.date || '').slice(0, 7);
                if(key in totals) totals[key] += 1;
            });
            return {
                labels: months.map(m => formatBulanIndonesia(m).replace(/^(\S+)\s+/, (match, p1) => p1.slice(0, 3) + ' ')),
                values: months.map(m => totals[m] || 0),
                note: 'Bulanan dalam 12 bulan terakhir'
            };
        }

        function buildDashboardOvertimeTimeline(rows) {
            const end = getCurrentMonth();
            const months = [];
            for(let i = 11; i >= 0; i--) months.push(getMonthKeyOffset(end, -i));
            const totals = Object.fromEntries(months.map(m => [m, 0]));
            (rows || []).forEach(row => {
                const key = String(row.date || '').slice(0, 7);
                if(key in totals) totals[key] += getLemburMinutesForRow(row);
            });
            return {
                labels: months.map(m => formatBulanIndonesia(m).replace(/^(\S+)\s+/, (match, p1) => p1.slice(0, 3) + ' ')),
                values: months.map(m => Math.round((totals[m] / 60) * 10) / 10)
            };
        }

        function renderPegawaiReadOnlyEmptyRow(colspan, message) {
            return `<tr><td colspan="${colspan}" class="p-6 text-center text-slate-400 italic font-black uppercase text-[9px]">${escapeHTML(message)}</td></tr>`;
        }

        window.renderDashboardPegawai = function(options = {}) {
            if(!window.currentUser || window.isAdmin) return;

            const monthEl = document.getElementById('pegawai-dashboard-month');
            if(monthEl && monthEl.value) monthEl.dataset.touched = 'true';
            const monthVal = monthEl ? monthEl.value : getCurrentMonth();
            const periodLabel = getPegawaiDashboardPeriodLabel(monthVal);
            const myRows = getMyJurnalRowsForDashboard(monthVal);
            const myOvertimeRows = myRows.filter(d => isAdminOvertimeRow(d));
            const unitRows = getUnitRowsForPegawaiDashboard(monthVal);
            const unitOvertimeRows = unitRows.filter(d => isAdminOvertimeRow(d));
            const userLab = getCurrentUserLab ? getCurrentUserLab() : (window.currentUser.lab || '-');

            const total = myRows.length;
            const selesai = myRows.filter(d => normalize(d.status || '').includes('selesai') && !normalize(d.status || '').includes('belum')).length;
            const overtimeMinutes = myOvertimeRows.reduce((sum, d) => sum + getLemburMinutesForRow(d), 0);
            const noteRows = myRows.filter(d => String(d.catatanAtasan || '').trim());
            const pendingNotes = noteRows.filter(isJurnalReviewNeedsFollowUp).length;

            setAdminText('pegawai-dashboard-subtitle', `${window.currentUser.nama || 'Pegawai'} • ${userLab || 'Fungsi/Lab belum terbaca'} • ${periodLabel}`);
            setAdminText('pegawai-kpi-jurnal', String(total));
            setAdminText('pegawai-kpi-jurnal-note', periodLabel);
            setAdminText('pegawai-kpi-selesai', percentText(selesai, total));
            setAdminText('pegawai-kpi-lembur', String(myOvertimeRows.length));
            setAdminText('pegawai-kpi-jam-lembur', formatOvertimeHours ? formatOvertimeHours(overtimeMinutes) : String(Math.round(overtimeMinutes / 60)));
            setAdminText('pegawai-kpi-catatan', String(noteRows.length));
            setAdminText('pegawai-kpi-catatan-note', `${pendingNotes} perlu tindak lanjut`);

            const statusCounts = countBy(myRows, d => (normalize(d.status || '').includes('selesai') && !normalize(d.status || '').includes('belum')) ? 'Selesai' : 'Belum Selesai');
            renderChart('pegawai-chart-status', 'pegawaiChartStatus', 'doughnut', Object.keys(statusCounts).length ? Object.keys(statusCounts) : ['Belum Ada Data'], [
                { label: 'Status', data: Object.keys(statusCounts).length ? Object.values(statusCounts) : [1] }
            ], { plugins: { legend: { position: 'bottom' } } });

            const trend = buildDashboardTimeline(myRows, monthVal);
            setAdminText('pegawai-trend-note', trend.note);
            renderChart('pegawai-chart-trend', 'pegawaiChartTrend', 'line', trend.labels, [
                { label: 'Jumlah Jurnal', data: trend.values, fill: true }
            ], { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } });

            const overtimeTrend = buildDashboardOvertimeTimeline(myOvertimeRows);
            renderChart('pegawai-chart-lembur', 'pegawaiChartLembur', 'bar', overtimeTrend.labels, [
                { label: 'Jam Lembur', data: overtimeTrend.values }
            ]);

            const unitTotal = unitRows.length;
            const unitSelesai = unitRows.filter(d => normalize(d.status || '').includes('selesai') && !normalize(d.status || '').includes('belum')).length;
            const unitPersons = new Set(unitRows.map(d => normalize(d.nip || d.name)).filter(Boolean)).size;
            setAdminText('pegawai-unit-note', `Agregat ${userLab || 'fungsi/lab'} • ${periodLabel} • tanpa rincian nama pegawai lain.`);
            setAdminText('pegawai-unit-total', String(unitTotal));
            setAdminText('pegawai-unit-selesai', percentText(unitSelesai, unitTotal));
            setAdminText('pegawai-unit-lembur', String(unitOvertimeRows.length));
            setAdminText('pegawai-unit-personil', String(unitPersons));

            const unitTrend = buildDashboardTimeline(unitRows, monthVal);
            renderChart('pegawai-chart-unit-trend', 'pegawaiChartUnitTrend', 'bar', unitTrend.labels, [
                { label: 'Jurnal Unit', data: unitTrend.values }
            ]);

            const overtimeBody = document.getElementById('pegawai-lembur-saya-body');
            if(overtimeBody) {
                const rows = myOvertimeRows.slice(0, 10);
                overtimeBody.innerHTML = rows.length ? rows.map(d => {
                    const hasLink = String(d.linkDataDukung || '').trim();
                    const linkHtml = hasLink ? `<a href="${escapeHTML(d.linkDataDukung)}" target="_blank" rel="noopener noreferrer" class="text-cyan-700 underline font-black">Ada</a>` : '<span class="text-rose-500 font-black">Belum</span>';
                    return `<tr><td class="p-3 whitespace-nowrap">${escapeHTML(formatHariTanggal(d.date))}</td><td class="p-3 text-center font-black text-amber-700">${escapeHTML(d.start || '-')} - ${escapeHTML(d.end || '-')}</td><td class="p-3 min-w-[280px]">${escapeHTML(d.desc || '-')}</td><td class="p-3 text-center font-black text-slate-900">${escapeHTML(formatDurasi(d.start, d.end, d.lamaLembur))}</td><td class="p-3 text-center">${linkHtml}</td></tr>`;
                }).join('') : renderPegawaiReadOnlyEmptyRow(5, 'Belum ada jurnal bertanda lembur pada periode ini.');
            }

            const catatanBody = document.getElementById('pegawai-catatan-body');
            if(catatanBody) {
                const rows = noteRows.slice(0, 10);
                catatanBody.innerHTML = rows.length ? rows.map(d => {
                    const done = isJurnalReviewFollowedUp(d);
                    const follow = done ? '<span class="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase">Sudah</span>' : '<span class="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[9px] font-black uppercase">Perlu</span>';
                    return `<tr><td class="p-3 whitespace-nowrap">${escapeHTML(formatHariTanggal(d.date))}</td><td class="p-3 min-w-[240px]">${escapeHTML(d.desc || '-')}</td><td class="p-3 whitespace-nowrap font-black text-indigo-700">${escapeHTML(d.statusEvaluasiAtasan || '-')}</td><td class="p-3 min-w-[260px]">${escapeHTML(d.catatanAtasan || '-')}</td><td class="p-3 text-center">${follow}</td></tr>`;
                }).join('') : renderPegawaiReadOnlyEmptyRow(5, 'Belum ada catatan atasan pada periode ini.');
            }
        };

        window.downloadExcelLembur = function() {
            if(!window.currentUser) return;

            const month = document.getElementById('filt-lembur-bulan')?.value || getCurrentMonth();
            const labPegawai = getCurrentUserLab();
            const ketuaTim = getKetuaTimByLab(labPegawai);
            const bulanLabel = formatBulanIndonesia(month).toUpperCase();
            const tanggalLaporan = formatDateIndo(new Date());

            const rows = window.arikaData
                .filter(d => d.isLembur && normalize(d.name) === normalize(window.currentUser.nama) && (!month || d.date.startsWith(month)))
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            const tableRows = rows.length ? rows.map((d, i) => `
                <tr>
                    <td style="border:1px solid #000;text-align:center;padding:6px;">${i + 1}</td>
                    <td style="border:1px solid #000;padding:6px;">${escapeHTML(d.suratTugas || '-')}</td>
                    <td style="border:1px solid #000;padding:6px;">${escapeHTML(formatHariTanggal(d.date))}</td>
                    <td style="border:1px solid #000;text-align:center;padding:6px;">${escapeHTML(d.start || '-')}</td>
                    <td style="border:1px solid #000;text-align:center;padding:6px;">${escapeHTML(d.end || '-')}</td>
                    <td style="border:1px solid #000;text-align:center;padding:6px;">${escapeHTML(formatDurasi(d.start, d.end, d.lamaLembur))}</td>
                    <td style="border:1px solid #000;padding:6px;">${escapeHTML(d.desc || '-')}</td>
                </tr>
            `).join('') : `
                <tr>
                    <td colspan="7" style="border:1px solid #000;text-align:center;padding:10px;">Tidak ada data lembur pada bulan ini.</td>
                </tr>
            `;

            const html = `
                <table style="border-collapse:collapse;font-family:Arial, sans-serif;font-size:12px;width:100%;">
                    <tr>
                        <td colspan="7" style="text-align:center;font-weight:bold;font-size:15px;padding:10px;">FORMULIR VERIFIKASI KEGIATAN LEMBUR</td>
                    </tr>
                    <tr><td colspan="7" style="height:8px;"></td></tr>
                    <tr>
                        <td style="font-weight:bold;width:120px;">NAMA PEGAWAI</td>
                        <td style="width:10px;">:</td>
                        <td colspan="5" style="font-weight:bold;">${escapeHTML(window.currentUser.nama || '-')}</td>
                    </tr>
                    <tr>
                        <td style="font-weight:bold;">NIP</td>
                        <td>:</td>
                        <td colspan="5">${escapeHTML(window.currentUser.nip || '-')}</td>
                    </tr>
                    <tr>
                        <td style="font-weight:bold;">BULAN</td>
                        <td>:</td>
                        <td colspan="5">${escapeHTML(bulanLabel)}</td>
                    </tr>
                    <tr><td colspan="7" style="height:12px;"></td></tr>
                    <tr>
                        <th style="border:1px solid #000;text-align:center;padding:6px;width:40px;">No.</th>
                        <th style="border:1px solid #000;text-align:center;padding:6px;width:180px;">Nomor / Tanggal Surat Tugas</th>
                        <th style="border:1px solid #000;text-align:center;padding:6px;width:170px;">Tanggal Melaksanakan Lembur</th>
                        <th style="border:1px solid #000;text-align:center;padding:6px;width:90px;">Jam Mulai Lembur</th>
                        <th style="border:1px solid #000;text-align:center;padding:6px;width:90px;">Jam Akhir Lembur</th>
                        <th style="border:1px solid #000;text-align:center;padding:6px;width:90px;">Lama Lembur (Jam)</th>
                        <th style="border:1px solid #000;text-align:center;padding:6px;width:260px;">Keterangan</th>
                    </tr>
                    ${tableRows}
                    <tr><td colspan="7" style="height:28px;"></td></tr>
                    <tr>
                        <td colspan="4"></td>
                        <td colspan="3" style="text-align:center;">Ambon, ${escapeHTML(tanggalLaporan)}</td>
                    </tr>
                    <tr>
                        <td colspan="4"></td>
                        <td colspan="3" style="text-align:center;font-weight:bold;">${escapeHTML(ketuaTim.jabatan)}</td>
                    </tr>
                    <tr><td colspan="7" style="height:58px;"></td></tr>
                    <tr>
                        <td colspan="4"></td>
                        <td colspan="3" style="text-align:center;font-weight:bold;text-decoration:underline;">${escapeHTML(ketuaTim.nama)}</td>
                    </tr>
                    <tr>
                        <td colspan="4"></td>
                        <td colspan="3" style="text-align:center;">NIP. ${escapeHTML(ketuaTim.nip)}</td>
                    </tr>
                </table>
            `;

            downloadXls(`form-verifikasi-lembur-${normalize(window.currentUser.nama)}-${month}.xls`, html);
        };

        window.downloadSPKLembur = function() {
            if(!window.currentUser) return;
            const month = document.getElementById('filt-lembur-bulan')?.value || getCurrentMonth();
            const rows = window.arikaData.filter(d => d.isLembur && normalize(d.name) === normalize(window.currentUser.nama) && (!month || d.date.startsWith(month)));
            let html = `<table border="1"><tr><th colspan="5">SURAT PERINTAH KERJA LEMBUR KOLEKTIF</th></tr><tr><td>Unit</td><td colspan="4">Balai POM di Ambon</td></tr><tr><th>No</th><th>Nama</th><th>Tanggal</th><th>Waktu</th><th>Uraian</th></tr>`;
            rows.forEach((d, i) => html += `<tr><td>${i+1}</td><td>${escapeHTML(d.name)}</td><td>${escapeHTML(formatHariTanggal(d.date))}</td><td>${escapeHTML(d.start)} - ${escapeHTML(d.end)}</td><td>${escapeHTML(d.desc)}</td></tr>`);
            html += '</table>';
            downloadXls(`spk-lembur-${normalize(window.currentUser.nama)}-${month}.xls`, html);
        };

        // v108: SPK Word dibuat tanpa header, tanpa footer, dan tanpa kop teks lama.
        function downloadWord(filename, htmlContent) {
            const html = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
                <head>
                    <meta charset="UTF-8">
                    <style>
                        @page WordSection1 {
                            size: 21cm 29.7cm;
                            margin: 1.55cm 1.65cm 1.45cm 1.65cm;
                        }
                        div.WordSection1 { page: WordSection1; }
                        body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; margin: 0; }
                        table { border-collapse: collapse; width: 100%; }
                        th, td { border: 1px solid #000; padding: 4px; vertical-align: top; }
                        .no-border td { border: none; }
                        .center { text-align: center; }
                        .right { text-align: right; }
                        .bold { font-weight: bold; }
                        p { margin: 7px 0; line-height: 1.22; }
                        .spk-month-summary { margin-bottom: 16px; }
                        .spk-day-section { margin-top: 8px; margin-bottom: 18px; page-break-inside: avoid; break-inside: avoid; }
                        .spk-day-section + .spk-day-section { border-top: 1px dashed #777; padding-top: 14px; }
                        .spk-title { font-size: 13pt; margin-bottom: 3px; }
                        .spk-number { margin-bottom: 10px; }
                        .spk-signature { margin-top: 12px; }
                        .signature-block { margin-top: 20px; width: 100%; }
                        .signature-inner { width: 42%; margin-left: 58%; margin-right: 0; text-align: center; }
                        .signature-space { height: 58px; line-height: 58px; }
                        table.signature-table, table.signature-table tr, table.signature-table td { border: none !important; }
                        table.signature-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
                        table.signature-table td { padding: 0; vertical-align: top; }

        /* v154: Perbaikan Google Sites - sembunyikan template cetak, hilangkan dock atas, dan kembalikan tombol melayang. */
        #print-area-jurnal,
        body:not(.arika-printing) #print-area-jurnal,
        body:not(.arika-printing) .print-area {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            min-height: 0 !important;
            max-height: 0 !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
        }
        @media print {
            #print-area-jurnal.print-area {
                display: block !important;
                visibility: visible !important;
                height: auto !important;
                min-height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                margin: 0 !important;
                padding: 2rem !important;
                border: 0 !important;
            }
        }
        .arika-embed-dock,
        body.arika-embed-mode .arika-embed-dock,
        #arika-embed-dock {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
        #arika-reminder-center-fab,
        .arika-reminder-center-fab {
            position: fixed !important;
            left: 18px !important;
            right: auto !important;
            bottom: 18px !important;
            z-index: 2147483000 !important;
        }
        #arika-reminder-center-panel,
        .arika-reminder-center-panel {
            position: fixed !important;
            left: 18px !important;
            right: auto !important;
            bottom: 86px !important;
            z-index: 2147483000 !important;
        }
        #btn-arika-help-wa,
        .arika-help-wa-btn {
            position: fixed !important;
            right: 18px !important;
            left: auto !important;
            bottom: 18px !important;
            z-index: 2147483001 !important;
        }
        html, body {
            max-width: 100% !important;
            overflow-x: hidden !important;
        }
        @media (max-width: 640px) {
            #arika-reminder-center-fab,
            .arika-reminder-center-fab { left: 12px !important; bottom: 12px !important; }
            #btn-arika-help-wa,
            .arika-help-wa-btn { right: 12px !important; bottom: 12px !important; }
            #arika-reminder-center-panel,
            .arika-reminder-center-panel { left: 10px !important; right: 10px !important; bottom: 72px !important; width: auto !important; }
        }

</style>
                </head>
                <body>
                    <div class="WordSection1">
                        ${htmlContent}
                    </div>
                </body></html>
            `;
            const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        window.downloadAdminSPKWord = function() {
            if(!window.isAdmin) return window.showCustomAlert('Akses admin diperlukan.');

            const spkDate = document.getElementById('admin-spk-date')?.value;
            if(!spkDate) return window.showCustomAlert('Pilih tanggal SPK Harian pada Dashboard Lembur terlebih dahulu.');

            const labSelect = document.getElementById('admin-overtime-lab')?.value || 'Semua';
            const verificationStatus = document.getElementById('admin-overtime-status')?.value || 'Semua';

            const rows = (window.arikaData || [])
                .filter(d => isAdminOvertimeRow(d) && d.date === spkDate)
                .filter(d => labMatches(d.lab, labSelect))
                .filter(d => verificationStatus === 'Semua' || getAdminOvertimeRowStatus(d).code === verificationStatus)
                .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

            if(rows.length === 0) {
                return window.showCustomAlert('Tidak ada jurnal bertanda lembur pada tanggal/filter Dashboard Lembur yang dipilih.');
            }

            const rowHtml = rows.map((d, i) => `
                <tr>
                    <td class="center">${i + 1}</td>
                    <td>${escapeHTML(d.name || '-')}</td>
                    <td class="center">${escapeHTML(d.nip || '-')}</td>
                    <td class="center">${escapeHTML(d.pangkat || '-')}</td>
                    <td class="center">${escapeHTML(formatDurasi(d.start, d.end, d.lamaLembur))}</td>
                    <td>${escapeHTML(d.desc || '-')}</td>
                </tr>
            `).join('');

            const html = `
                <div class="center bold" style="font-size:14pt;">SURAT PERINTAH KERJA LEMBUR</div>
                <div class="center" style="margin-bottom:22px;">Nomor : KU.01.03.58B.${new Date(spkDate).getMonth() + 1}.${new Date(spkDate).getFullYear()}.</div>

                <p>Yang bertanda tangan dibawah ini: Pejabat Pembuat Komitmen Balai POM di Ambon memerintahkan kerja lembur kepada:</p>
                <table>
                    <tr>
                        <th style="width:6%;">No</th>
                        <th style="width:22%;">Nama Pegawai</th>
                        <th style="width:18%;">NIP</th>
                        <th style="width:14%;">Pangkat/Gol</th>
                        <th style="width:12%;">Waktu (Jam)</th>
                        <th style="width:28%;">Jenis Pekerjaan</th>
                    </tr>
                    ${rowHtml}
                </table>

                <p>Pada hari <b>${escapeHTML(getDayName(spkDate))}</b> tanggal <b>${escapeHTML(formatDateIndo(spkDate))}</b> untuk menyelesaikan pekerjaan yang tidak dapat ditangguhkan. Dalam pelaksanaan perintah ini bukti daftar hadir harian sesuai kenyataannya pada mesin finger print/E-presensi.</p>
                <p>Demikian agar dilaksanakan dengan penuh rasa tanggung jawab.</p>

                <table class="signature-table" style="width:100%; border-collapse:collapse; border:none; margin-top:24px;">
                    <tr>
                        <td style="width:58%; border:none; padding:0;">&nbsp;</td>
                        <td style="width:42%; border:none; padding:0; text-align:center; vertical-align:top;">
                            <div>Ambon, ${escapeHTML(formatDateIndo(spkDate))}</div>
                            <div>Pejabat Pembuat Komitmen</div>
                            <div style="height:72px; line-height:72px;">&nbsp;</div>
                            <div>Brian,S.E</div>
                            <div>NIP. 199409112022031001</div>
                        </td>
                    </tr>
                </table>
            `;

            downloadWord(`SPK-Kolektif-Lembur-${spkDate}.doc`, html);
        };

        function getAdminFilteredLemburRowsForSPK() {
            const { start: rangeStart, end: rangeEnd } = getDateRangeValues('admin-spk-range-start', 'admin-spk-range-end');
            const labSelect = document.getElementById('admin-overtime-lab')?.value || 'Semua';
            const verificationStatus = document.getElementById('admin-overtime-status')?.value || 'Semua';
            const searchText = normalize(document.getElementById('admin-overtime-search')?.value || '');

            return (window.arikaData || [])
                .filter(d => {
                    const matchesRange = dateInRange(d.date, rangeStart, rangeEnd);
                    const matchesLab = labMatches(d.lab, labSelect);
                    const statusInfo = getAdminOvertimeRowStatus(d);
                    const matchesStatus = verificationStatus === 'Semua' || statusInfo.code === verificationStatus;
                    const haystack = normalize([d.name, d.nip, d.lab, d.cat, d.desc, d.status, d.suratTugas, d.linkDataDukung, d.start, d.end, d.lamaLembur].join(' '));
                    const matchesSearch = !searchText || haystack.includes(searchText);
                    return isAdminOvertimeRow(d) && matchesRange && matchesLab && matchesStatus && matchesSearch;
                })
                .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || normalize(a.name).localeCompare(normalize(b.name)));
        }

        function buildSPKHarianSection(spkDate, rows, options = {}) {
            const rowHtml = rows.map((d, i) => `
                <tr>
                    <td class="center" style="width:6%;">${i + 1}</td>
                    <td style="width:22%;">${escapeHTML(d.name || '-')}</td>
                    <td class="center" style="width:18%;">${escapeHTML(d.nip || '-')}</td>
                    <td class="center" style="width:14%;">${escapeHTML(d.pangkat || '-')}</td>
                    <td class="center" style="width:12%;">${escapeHTML(formatDurasi(d.start, d.end, d.lamaLembur))}</td>
                    <td style="width:28%;">${escapeHTML(d.desc || '-')}</td>
                </tr>
            `).join('');

            return `
                <div class="spk-day-section">
                    <div class="center bold spk-title">SURAT PERINTAH KERJA LEMBUR</div>
                    <div class="center spk-number">Nomor : KU.01.03.58B.${new Date(spkDate).getMonth() + 1}.${new Date(spkDate).getFullYear()}.</div>

                    <p>Yang bertanda tangan dibawah ini: Pejabat Pembuat Komitmen Balai POM di Ambon memerintahkan kerja lembur kepada:</p>

                    <table>
                        <tr>
                            <th>No</th>
                            <th>Nama Pegawai</th>
                            <th>NIP</th>
                            <th>Pangkat/Gol</th>
                            <th>Waktu (Jam)</th>
                            <th>Jenis Pekerjaan</th>
                        </tr>
                        ${rowHtml}
                    </table>

                    <p>Pada hari <b>${escapeHTML(getDayName(spkDate))}</b> tanggal <b>${escapeHTML(formatDateIndo(spkDate))}</b> untuk menyelesaikan pekerjaan yang tidak dapat ditangguhkan. Dalam pelaksanaan perintah ini bukti daftar hadir harian sesuai kenyataannya pada mesin finger print/E-presensi.</p>
                    <p>Demikian agar dilaksanakan dengan penuh rasa tanggung jawab.</p>

                    <table class="signature-table spk-signature" style="width:100%; border-collapse:collapse; border:none; margin-top:24px;">
                        <tr>
                            <td style="width:58%; border:none; padding:0;">&nbsp;</td>
                            <td style="width:42%; border:none; padding:0; text-align:center; vertical-align:top;">
                                <div>Ambon, ${escapeHTML(formatDateIndo(spkDate))}</div>
                                <div>Pejabat Pembuat Komitmen</div>
                                <div style="height:72px; line-height:72px;">&nbsp;</div>
                                <div>Brian,S.E</div>
                                <div>NIP. 199409112022031001</div>
                            </td>
                        </tr>
                    </table>
                </div>
            `;
        }

        window.downloadAdminSPKBulananWord = function() {
            if(!window.isAdmin) return window.showCustomAlert('Akses admin diperlukan.');

            const { start: rangeStart, end: rangeEnd } = getDateRangeValues('admin-spk-range-start', 'admin-spk-range-end');
            if(!rangeStart && !rangeEnd) return window.showCustomAlert('Tentukan rentang tanggal SPK pada Dashboard Lembur terlebih dahulu.');

            const rows = getAdminFilteredLemburRowsForSPK();

            if(rows.length === 0) {
                return window.showCustomAlert('Tidak ada jurnal bertanda lembur pada rentang/filter Dashboard Lembur yang dipilih.');
            }

            const groupedByDate = {};
            rows.forEach(row => {
                const key = String(row.date || '');
                if(!key) return;
                if(!groupedByDate[key]) groupedByDate[key] = [];
                groupedByDate[key].push(row);
            });

            const dates = Object.keys(groupedByDate).sort();
            const labSelect = document.getElementById('admin-filter-lab')?.value || 'Semua';
            const statusSelect = document.getElementById('admin-filter-status')?.value || 'Semua';

            const summary = `
                <div class="spk-month-summary">
                    <div class="center bold" style="font-size:14pt;">DAFTAR SPK LEMBUR KOLEKTIF RENTANG WAKTU</div>
                    <div class="center" style="margin:6px 0 10px 0;">
                        Periode: <b>${escapeHTML(rangeStart || 'Awal')} s.d. ${escapeHTML(rangeEnd || 'Akhir')}</b>
                        ${labSelect !== 'Semua' ? ` | Fungsi/Lab: <b>${escapeHTML(labSelect)}</b>` : ''}
                        ${statusSelect !== 'Semua' ? ` | Status verifikasi: <b>${escapeHTML(statusSelect)}</b>` : ''}
                    </div>
                    <table>
                        <tr>
                            <th style="width:8%;">No</th>
                            <th style="width:52%;">Tanggal Lembur</th>
                            <th style="width:20%;">Jumlah Pegawai</th>
                            <th style="width:20%;">Jumlah Entri</th>
                        </tr>
                        ${dates.map((date, i) => `<tr><td class="center">${i + 1}</td><td>${escapeHTML(formatHariTanggal(date))}</td><td class="center">${new Set(groupedByDate[date].map(r => normalize(r.name))).size}</td><td class="center">${groupedByDate[date].length}</td></tr>`).join('')}
                    </table>
                </div>
            `;

            // Tidak memakai page-break paksa agar kop, judul, narasi, tabel, dan tanda tangan tidak terpisah tidak rapi.
            // Tiap SPK harian tetap lengkap, namun ditata mengalir dalam satu file Word bulanan.
            const sections = dates.map(date => buildSPKHarianSection(date, groupedByDate[date])).join('');

            downloadWord(`SPK-Kolektif-Lembur-Rentang-${rangeStart || 'awal'}-${rangeEnd || 'akhir'}.doc`, summary + sections);
        };

        window.downloadAdminAllExcel = function() {
            if(!window.isAdmin) return window.showCustomAlert('Akses admin diperlukan.');
            const { start: rangeStart, end: rangeEnd } = getDateRangeValues('admin-filter-start', 'admin-filter-end');
            const labSelect = document.getElementById('admin-filter-lab')?.value || 'Semua';
            const statusSelect = document.getElementById('admin-filter-status')?.value || 'Semua';
            const typeSelect = document.getElementById('admin-filter-type')?.value || 'Semua';
            const rows = window.arikaData.filter(d => {
                const matchesRange = dateInRange(d.date, rangeStart, rangeEnd);
                const matchesLab = labMatches(d.lab, labSelect);
                const matchesStatus = statusSelect === 'Semua' || normalize(d.statusPegawai) === normalize(statusSelect);
                const matchesType = typeSelect === 'Semua' || (typeSelect === 'Lembur' ? d.isLembur : !d.isLembur);
                return matchesRange && matchesLab && matchesStatus && matchesType;
            });
            const periodText = `${rangeStart || 'awal'} s.d. ${rangeEnd || 'akhir'}`;
            let html = `<table border="1"><tr><th colspan="8">REKAP JURNAL PEGAWAI ARIKA - ${escapeHTML(periodText)}</th></tr><tr><th>Tanggal</th><th>Nama</th><th>NIP</th><th>Status Pegawai</th><th>Lab/Fungsi</th><th>Kategori</th><th>Status Pekerjaan</th><th>Uraian</th></tr>`;
            rows.forEach(d => html += `<tr><td>${escapeHTML(formatHariTanggal(d.date))}</td><td>${escapeHTML(d.name)}</td><td>${escapeHTML(d.nip || '-')}</td><td>${escapeHTML(d.statusPegawai || '-')}</td><td>${escapeHTML(d.lab || '-')}</td><td>${escapeHTML(d.cat || '-')}</td><td>${escapeHTML(d.status || '-')}</td><td>${escapeHTML(d.desc)}</td></tr>`);
            html += '</table>';
            downloadXls(`rekap-semua-pegawai-${rangeStart || 'awal'}-${rangeEnd || 'akhir'}.xls`, html);
        };

        // --- 📝 SURVEI KEPUASAN, KEMANFAATAN & TINDAK LANJUT ---
        function loadLocalSurvei() {
            try { return JSON.parse(localStorage.getItem('arika_survei') || '[]'); } catch (_) { return []; }
        }

        function saveLocalSurvei(list) {
            try { localStorage.setItem('arika_survei', JSON.stringify(list || [])); } catch (_) {}
        }

        function getCurrentSurveyMonth() {
            return getCurrentMonth();
        }

        function getSurveyKey(item) {
            return [String(item.bulan || ''), normalize(item.nip || item.nama || '')].join('|');
        }

        const SURVEY_ADMIN_WA = '6282220218987';

        window.setSurveyRating = function(field, value) {
            const safeValue = Math.max(1, Math.min(5, Number(value) || 1));
            const input = document.getElementById('survey-' + field);
            if(input) input.value = String(safeValue);

            const wrap = document.querySelector(`[data-survey-rating="${field}"]`);
            if(wrap) {
                Array.from(wrap.querySelectorAll('.survey-star')).forEach((btn, idx) => {
                    const active = idx < safeValue;
                    btn.textContent = active ? '★' : '☆';
                    btn.className = `survey-star text-2xl leading-none transition-transform hover:scale-110 ${active ? 'text-amber-400 drop-shadow-sm' : 'text-slate-300'}`;
                });
            }

            const label = document.getElementById(`survey-${field}-label-value`);
            if(label) label.innerText = `${safeValue}/5`;
        };

        window.initSurveyStars = function() {
            ['kemudahan', 'kemanfaatan', 'efisiensi', 'kepuasan'].forEach(field => {
                const input = document.getElementById('survey-' + field);
                const current = Number(input?.value || 5);
                window.setSurveyRating(field, current || 5);
            });
        };

        function getSurveyOverallLabel(avg) {
            if(avg >= 4.5) return 'Sangat Baik';
            if(avg >= 3.5) return 'Baik';
            if(avg >= 2.5) return 'Cukup';
            if(avg >= 1.5) return 'Perlu Perbaikan';
            return 'Perlu Perhatian Serius';
        }

        function buildSurveyWhatsAppMessage(payload) {
            const skor = [
                Number(payload.kemudahan || 0),
                Number(payload.kemanfaatan || 0),
                Number(payload.efisiensi || 0),
                Number(payload.kepuasan || 0)
            ];
            const avg = Math.round((skor.reduce((a,b) => a + b, 0) / skor.length) * 10) / 10;
            return [
                'Selamat, Admin ARIKA.',
                '',
                'Mohon izin, ada survei kepuasan dan kemanfaatan ARIKA yang baru saja dikirim.',
                '',
                `Nama: ${payload.nama || '-'}`,
                `NIP: ${payload.nip || '-'}`,
                `Laboratorium/Fungsi: ${payload.lab || '-'}`,
                `Periode Survei: ${formatBulanIndonesia(payload.bulan || getCurrentSurveyMonth())}`,
                '',
                `Kemudahan: ${payload.kemudahan}/5 ⭐`,
                `Kemanfaatan: ${payload.kemanfaatan}/5 ⭐`,
                `Efisiensi: ${payload.efisiensi}/5 ⭐`,
                `Kepuasan: ${payload.kepuasan}/5 ⭐`,
                `Rata-rata: ${avg}/5 (${getSurveyOverallLabel(avg)})`,
                '',
                `Fitur paling membantu: ${payload.fiturTerbantu || '-'}`,
                `Kendala: ${payload.kendala || '-'}`,
                `Saran: ${payload.saran || '-'}`,
                '',
                'Terima kasih. Mohon dapat menjadi bahan monitoring dan tindak lanjut pengembangan ARIKA.'
            ].join('\n');
        }

        window.openSurveyWhatsAppToAdmin = function(payload) {
            const text = encodeURIComponent(buildSurveyWhatsAppMessage(payload));
            const url = `https://wa.me/${SURVEY_ADMIN_WA}?text=${text}`;
            const opened = window.open(url, '_blank', 'noopener,noreferrer');
            if(!opened) {
                const statusBox = document.getElementById('survey-status-box');
                if(statusBox) {
                    statusBox.classList.remove('hidden');
                    statusBox.innerHTML += `<div class="mt-3"><a href="${url}" target="_blank" rel="noopener" class="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest">Kirim Notifikasi WA ke Admin</a></div>`;
                }
            }
        };

        function dedupeSurveyList(list) {
            const seen = new Set();
            const out = [];
            (list || []).forEach(item => {
                if(!item) return;
                const key = getSurveyKey(item);
                if(seen.has(key)) return;
                seen.add(key);
                out.push(item);
            });
            return out;
        }

        function surveyAverage(item) {
            const nums = [item.kemudahan, item.kemanfaatan, item.efisiensi, item.kepuasan].map(Number).filter(n => !Number.isNaN(n) && n > 0);
            if(!nums.length) return 0;
            return Math.round((nums.reduce((a,b) => a + b, 0) / nums.length) * 10) / 10;
        }

        function getUserSurveyThisMonth() {
            if(!window.currentUser) return null;
            const month = getCurrentSurveyMonth();
            const userKey = normalize(window.currentUser.nip || window.currentUser.nama);
            return (window.surveiData || []).find(s => String(s.bulan || '') === month && normalize(s.nip || s.nama) === userKey) || null;
        }

        window.renderSurveiPegawai = function() {
            const card = document.getElementById('survey-arika-card');
            const form = document.getElementById('form-survei-arika');
            const statusBox = document.getElementById('survey-status-box');
            const monthLabel = document.getElementById('survey-month-label');
            if(!card || !form || !statusBox) return;
            if(!window.currentUser || window.isAdmin) {
                card.classList.add('hidden');
                return;
            }
            card.classList.remove('hidden');
            const month = getCurrentSurveyMonth();
            if(monthLabel) monthLabel.innerText = formatBulanIndonesia(month);
            const existing = getUserSurveyThisMonth();
            if(existing) {
                form.classList.add('hidden');
                statusBox.classList.remove('hidden');
                statusBox.innerHTML = `Terima kasih, survei ARIKA untuk <b>${escapeHTML(formatBulanIndonesia(month))}</b> sudah terkirim. Masukanmu membantu kami menyusun tindak lanjut perbaikan sistem.`;
            } else {
                form.classList.remove('hidden');
                statusBox.classList.add('hidden');
                statusBox.innerHTML = '';
                setTimeout(() => window.initSurveyStars && window.initSurveyStars(), 0);
            }
        };

        let isSavingSurvey = false;
        window.simpanSurveiArika = async function(e) {
            e.preventDefault();
            if(isSavingSurvey) return;
            if(!window.currentUser || window.isAdmin) return window.showCustomAlert('Survei hanya untuk akun personil pegawai.');
            const existing = getUserSurveyThisMonth();
            if(existing) return window.renderSurveiPegawai();

            const kemudahan = Number(document.getElementById('survey-kemudahan')?.value || 0);
            const kemanfaatan = Number(document.getElementById('survey-kemanfaatan')?.value || 0);
            const efisiensi = Number(document.getElementById('survey-efisiensi')?.value || 0);
            const kepuasan = Number(document.getElementById('survey-kepuasan')?.value || 0);
            const rataSurvei = Math.round(((kemudahan + kemanfaatan + efisiensi + kepuasan) / 4) * 10) / 10;

            const payload = {
                id: makeLocalId('survei'),
                bulan: getCurrentSurveyMonth(),
                nama: window.currentUser.nama || '',
                nip: window.currentUser.nip || '',
                lab: window.currentUser.lab || '',
                statusPegawai: window.currentUser.status || '',
                kemudahan,
                kemanfaatan,
                efisiensi,
                kepuasan,
                penilaianUmum: getSurveyOverallLabel(rataSurvei),
                fiturTerbantu: document.getElementById('survey-fitur')?.value || '',
                kendala: document.getElementById('survey-kendala')?.value.trim() || '',
                saran: document.getElementById('survey-saran')?.value.trim() || '',
                createdAt: new Date().toISOString()
            };

            isSavingSurvey = true;
            window.showLoader(true, 'Mengirim Survei...');
            try {
                await postToScript('save_survei', payload);
                window.surveiData = dedupeSurveyList([payload, ...(window.surveiData || [])]);
                saveLocalSurvei(window.surveiData);
                saveLocalCoreCache();
                document.getElementById('form-survei-arika')?.reset();
                window.initSurveyStars();
                window.renderSurveiPegawai();
                window.openSurveyWhatsAppToAdmin(payload);
                window.showCustomAlert('Terima kasih, survei ARIKA bulan ini sudah terkirim. Notifikasi WhatsApp untuk admin utama akan dibuka otomatis.');
            } catch(err) {
                window.showCustomAlert('Gagal mengirim survei: ' + err.message);
            } finally {
                isSavingSurvey = false;
                window.showLoader(false);
            }
        };

        function getAdminSurveyRows() {
            const monthVal = document.getElementById('admin-survei-month')?.value || getCurrentMonth();
            const rows = (window.surveiData || []).filter(s => !monthVal || String(s.bulan || '').startsWith(monthVal));
            return { rows, monthVal };
        }

        function getSurveyStats(rows) {
            const avg = (field) => {
                const nums = rows.map(r => Number(r[field])).filter(n => !Number.isNaN(n) && n > 0);
                return nums.length ? Math.round((nums.reduce((a,b) => a + b, 0) / nums.length) * 10) / 10 : 0;
            };
            const aspek = {
                Kemudahan: avg('kemudahan'),
                Kemanfaatan: avg('kemanfaatan'),
                Efisiensi: avg('efisiensi'),
                Kepuasan: avg('kepuasan')
            };
            const overall = rows.length ? Math.round((Object.values(aspek).reduce((a,b) => a + b, 0) / 4) * 10) / 10 : 0;
            const lowRows = rows.filter(r => surveyAverage(r) > 0 && surveyAverage(r) < 3.5);
            const featureCounts = countBy(rows, r => r.fiturTerbantu || 'Belum Diisi');
            const topFeature = Object.entries(featureCounts).sort((a,b) => b[1] - a[1])[0] || ['-', 0];
            return { aspek, overall, lowRows, featureCounts, topFeature };
        }

        function buildSurveyActionRows(rows, stats) {
            const actionRows = [];
            const add = (isu, kondisi, tindakLanjut, pic, target) => actionRows.push({ isu, kondisi, tindakLanjut, pic, target });
            const aspek = stats.aspek;
            Object.entries(aspek).forEach(([name, score]) => {
                if(score && score < 4) {
                    const rekom = name === 'Kemudahan'
                        ? 'Sederhanakan panduan pengisian, perjelas label form, dan cek kendala akses/login.'
                        : name === 'Kemanfaatan'
                            ? 'Sosialisasikan manfaat fitur utama dan kumpulkan contoh penggunaan yang paling membantu pegawai.'
                            : name === 'Efisiensi'
                                ? 'Evaluasi langkah input yang masih memakan waktu dan kurangi field yang tidak wajib bila memungkinkan.'
                                : 'Perbaiki pengalaman pengguna berdasarkan saran terbanyak dan lakukan uji coba ulang bulan berikutnya.';
                    add(name, `Skor rata-rata ${score}/5`, rekom, 'Admin ARIKA / Tim Pengelola', 'Bulan berjalan');
                }
            });
            const withKendala = rows.filter(r => String(r.kendala || '').trim()).length;
            if(withKendala > 0) add('Kendala pengguna', `${withKendala} responden menyampaikan kendala`, 'Klasifikasikan kendala, buat daftar prioritas perbaikan, dan tindak lanjuti kendala yang berulang.', 'Admin ARIKA', 'Maks. 7 hari kerja');
            const withSaran = rows.filter(r => String(r.saran || '').trim()).length;
            if(withSaran > 0) add('Saran pengembangan', `${withSaran} responden memberi saran`, 'Tinjau saran yang paling sering muncul dan masukkan ke backlog pengembangan ARIKA.', 'Tim Pengembang / Admin', 'Rapat evaluasi bulanan');
            if(!actionRows.length) add('Pemeliharaan mutu layanan', 'Skor survei berada pada kategori baik', 'Pertahankan fitur berjalan, lakukan monitoring rutin, dan tetap buka kanal masukan pengguna.', 'Admin ARIKA', 'Berkelanjutan');
            return actionRows;
        }

        window.renderAdminSurvei = function() {
            if(!window.isAdmin) return;
            setDefaultDates();
            const { rows, monthVal } = getAdminSurveyRows();
            const stats = getSurveyStats(rows);
            setAdminText('survey-kpi-count', String(rows.length));
            setAdminText('survey-kpi-score', stats.overall ? String(stats.overall) + '/5' : '0');
            setAdminText('survey-kpi-low', String(stats.lowRows.length));
            setAdminText('survey-kpi-feature', `${stats.topFeature[0]}${stats.topFeature[1] ? ' (' + stats.topFeature[1] + ')' : ''}`);
            setAdminText('survey-period-label', formatBulanIndonesia(monthVal));

            renderChart('survey-chart-score', 'surveyChartScore', 'bar', Object.keys(stats.aspek), [
                { label: 'Skor Rata-rata', data: Object.values(stats.aspek), backgroundColor: '#10b981' }
            ], { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } }, x: { grid: { display: false } } } });

            const featureLabels = Object.keys(stats.featureCounts);
            renderChart('survey-chart-feature', 'surveyChartFeature', 'doughnut', featureLabels, [
                { data: featureLabels.map(k => stats.featureCounts[k]), backgroundColor: ['#10b981', '#06b6d4', '#f59e0b', '#f43f5e', '#6366f1', '#14b8a6', '#84cc16'], borderWidth: 0 }
            ], { cutout: '65%' });

            const actionBody = document.getElementById('survey-action-body');
            if(actionBody) {
                actionBody.innerHTML = buildSurveyActionRows(rows, stats).map(r => `
                    <tr class="hover:bg-slate-50">
                        <td class="p-4 font-black text-slate-900 uppercase text-[10px]">${escapeHTML(r.isu)}</td>
                        <td class="p-4 text-[11px]">${escapeHTML(r.kondisi)}</td>
                        <td class="p-4 text-[11px] leading-relaxed">${escapeHTML(r.tindakLanjut)}</td>
                        <td class="p-4 text-[11px]"><b>${escapeHTML(r.pic)}</b><br><span class="text-slate-400">Target: ${escapeHTML(r.target)}</span></td>
                    </tr>
                `).join('');
            }

            const feedbackBody = document.getElementById('survey-feedback-body');
            if(feedbackBody) {
                feedbackBody.innerHTML = rows.length ? rows.map(r => `
                    <tr class="hover:bg-slate-50">
                        <td class="p-4"><div class="font-black text-slate-900 uppercase text-[10px]">${escapeHTML(r.nama || '-')}</div><div class="text-[9px] text-slate-400">${escapeHTML(r.lab || '-')}</div></td>
                        <td class="p-4 font-black text-emerald-600">${surveyAverage(r) || '-'}</td>
                        <td class="p-4 text-[11px]">${escapeHTML(r.fiturTerbantu || '-')}</td>
                        <td class="p-4 text-[11px]">${escapeHTML(r.kendala || '-')}</td>
                        <td class="p-4 text-[11px]">${escapeHTML(r.saran || '-')}</td>
                    </tr>
                `).join('') : '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic text-xs">Belum ada hasil survei pada periode ini.</td></tr>';
            }
        };

        window.downloadSurveyReportWord = function() {
            if(!window.isAdmin) return window.showCustomAlert('Akses admin diperlukan.');
            const { rows, monthVal } = getAdminSurveyRows();
            const stats = getSurveyStats(rows);
            const actionRows = buildSurveyActionRows(rows, stats).map((r, i) => `<tr><td class="center">${i+1}</td><td>${escapeHTML(r.isu)}</td><td>${escapeHTML(r.kondisi)}</td><td>${escapeHTML(r.tindakLanjut)}</td><td>${escapeHTML(r.pic)} - Target: ${escapeHTML(r.target)}</td></tr>`).join('');
            const feedbackRows = rows.slice(0, 20).map((r, i) => `<tr><td class="center">${i+1}</td><td>${escapeHTML(r.nama || '-')}</td><td class="center">${surveyAverage(r) || '-'}</td><td>${escapeHTML(r.fiturTerbantu || '-')}</td><td>${escapeHTML(r.kendala || '-')}</td><td>${escapeHTML(r.saran || '-')}</td></tr>`).join('') || '<tr><td colspan="6" class="center">Belum ada responden</td></tr>';
            const html = `
                <div class="center bold" style="font-size:14pt;">LAPORAN SURVEI KEPUASAN DAN KEMANFAATAN ARIKA</div>
                <div class="center" style="margin-bottom:18px;">Periode: ${escapeHTML(formatBulanIndonesia(monthVal))}</div>
                <p><b>Ringkasan:</b> Survei ARIKA diisi oleh ${rows.length} responden dengan rata-rata skor keseluruhan ${stats.overall || 0}/5. Fitur yang paling banyak dinilai membantu adalah ${escapeHTML(stats.topFeature[0])}.</p>
                <table><tr><th>Aspek</th><th>Skor Rata-rata</th></tr>${Object.entries(stats.aspek).map(([k,v]) => `<tr><td>${escapeHTML(k)}</td><td class="center">${v || 0}/5</td></tr>`).join('')}</table>
                <h3>Monitoring Evaluasi dan Tindak Lanjut</h3>
                <table><tr><th>No</th><th>Aspek/Isu</th><th>Kondisi</th><th>Tindak Lanjut</th><th>PIC & Target</th></tr>${actionRows}</table>
                <h3>Masukan Pengguna</h3>
                <table><tr><th>No</th><th>Nama</th><th>Skor</th><th>Fitur</th><th>Kendala</th><th>Saran</th></tr>${feedbackRows}</table>
                <p style="margin-top:24px;">Catatan: Laporan ini dihasilkan otomatis dari survei ARIKA dan digunakan sebagai bahan monitoring, evaluasi, serta tindak lanjut pengembangan sistem.</p>
            `;
            downloadWord(`Laporan-Survei-ARIKA-${monthVal || 'periode'}.doc`, html);
        };

        window.downloadSurveyMonevExcel = function() {
            if(!window.isAdmin) return window.showCustomAlert('Akses admin diperlukan.');
            const { rows, monthVal } = getAdminSurveyRows();
            const stats = getSurveyStats(rows);
            let html = `<table border="1"><tr><th colspan="5">MONEV TINDAK LANJUT HASIL SURVEI ARIKA - ${escapeHTML(formatBulanIndonesia(monthVal))}</th></tr><tr><th>No</th><th>Aspek/Isu</th><th>Kondisi</th><th>Tindak Lanjut</th><th>PIC & Target</th></tr>`;
            buildSurveyActionRows(rows, stats).forEach((r, i) => html += `<tr><td>${i+1}</td><td>${escapeHTML(r.isu)}</td><td>${escapeHTML(r.kondisi)}</td><td>${escapeHTML(r.tindakLanjut)}</td><td>${escapeHTML(r.pic)} - Target: ${escapeHTML(r.target)}</td></tr>`);
            html += `</table><br><table border="1"><tr><th colspan="8">DATA RESPONDEN SURVEI</th></tr><tr><th>Nama</th><th>NIP</th><th>Lab</th><th>Kemudahan</th><th>Kemanfaatan</th><th>Efisiensi</th><th>Kepuasan</th><th>Saran</th></tr>`;
            rows.forEach(r => html += `<tr><td>${escapeHTML(r.nama)}</td><td>${escapeHTML(r.nip)}</td><td>${escapeHTML(r.lab)}</td><td>${r.kemudahan}</td><td>${r.kemanfaatan}</td><td>${r.efisiensi}</td><td>${r.kepuasan}</td><td>${escapeHTML(r.saran || '')}</td></tr>`);
            html += '</table>';
            downloadXls(`monev-tindak-lanjut-survei-arika-${monthVal || 'periode'}.xls`, html);
        };

        // Override tabel lembur dengan durasi pembulatan verifikasi 1/2 jam.
        window.renderLemburTable = function() {
            const body = document.getElementById('lembur-body');
            const filt = document.getElementById('filt-lembur-bulan')?.value || '';
            if(!body) return;
            body.innerHTML = '';
            if(!window.currentUser) return;
            const targetName = normalize(window.currentUser.nama);
            const data = window.arikaData.filter(d => d.isLembur && normalize(d.name) === targetName && (!filt || d.date.startsWith(filt)));
            if(data.length === 0) {
                body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400 italic text-[9px] uppercase font-black">Kosong</td></tr>';
                return;
            }
            data.forEach(d => {
                body.innerHTML += `<tr><td class="p-4 font-mono text-[9px] text-center">${escapeHTML(formatHariTanggal(d.date))}</td><td class="p-4 text-center font-black text-rose-500 text-[9px]">${escapeHTML(d.start || '-')} - ${escapeHTML(d.end || '-')}</td><td class="p-4 uppercase text-[9px] font-bold text-center sm:text-left"><div class="arika-history-desc-full">${escapeHTMLPreserveLines(d.desc)}</div></td><td class="p-4 text-center font-black text-slate-900 text-[9px] flex items-center justify-center gap-2">${escapeHTML(formatDurasi(d.start, d.end, d.lamaLembur))} <button onclick="window.editJurnal('${escapeHTML(d.id)}')" class="p-1 bg-cyan-50 text-cyan-700 rounded text-[8px] hover:bg-cyan-600 hover:text-white transition-colors">✏️</button><button onclick="window.hapusJurnal('${escapeHTML(d.date)}', \`${escapeHTML(d.desc).replaceAll('`', '')}\`, '${escapeHTML(d.id)}')" class="p-1 bg-rose-50 text-rose-600 rounded text-[8px] hover:bg-rose-500 hover:text-white transition-colors">🗑️</button></td></tr>`;
            });
        };

        let arikaBackgroundSyncTimer = null;
        let arikaBackgroundSyncAttempts = 0;

        function hasMeaningfulDataLoaded() {
            return [
                window.arikaData,
                window.pengumumanData,
                window.rencanaData,
                window.agendaData,
                window.surveiData
            ].some(arr => Array.isArray(arr) && arr.length > 0);
        }

        function updateSyncStatus(text, tone = 'info') {
            const syncEl = document.getElementById('sync-status');
            if(!syncEl) return;
            syncEl.innerText = text;
            const classes = {
                info: 'text-[8px] md:text-[10px] font-bold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer hover:bg-cyan-100 transition-colors',
                ok: 'text-[8px] md:text-[10px] font-bold text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer hover:bg-emerald-100 transition-colors',
                warn: 'text-[8px] md:text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer hover:bg-amber-100 transition-colors',
                err: 'text-[8px] md:text-[10px] font-bold text-rose-500 bg-rose-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer hover:bg-rose-100 transition-colors'
            };
            syncEl.className = classes[tone] || classes.info;
        }

        function scheduleBackgroundDataSync(reason = 'auto') {
            clearTimeout(arikaBackgroundSyncTimer);
            const delays = [500, 1800, 4000, 8000, 15000];
            const delay = delays[Math.min(arikaBackgroundSyncAttempts, delays.length - 1)];
            arikaBackgroundSyncTimer = setTimeout(async () => {
                if(window.__ARIKA_FETCHING_CLOUD__) {
                    scheduleBackgroundDataSync('busy');
                    return;
                }
                arikaBackgroundSyncAttempts += 1;
                updateSyncStatus('Sinkron otomatis...', 'info');
                try {
                    await window.fetchCloudData();
                    if(hasMeaningfulDataLoaded()) {
                        arikaBackgroundSyncAttempts = 0;
                        updateSyncStatus('Database Sinkron', 'ok');
                    } else if(arikaBackgroundSyncAttempts < 5) {
                        scheduleBackgroundDataSync('empty');
                    }
                } catch(err) {
                    console.warn('Auto sync gagal:', err);
                    if(arikaBackgroundSyncAttempts < 5) {
                        updateSyncStatus('Mencoba sinkron ulang...', 'warn');
                        scheduleBackgroundDataSync('retry');
                    } else {
                        updateSyncStatus('Klik untuk sinkron', 'warn');
                    }
                }
            }, delay);
        }

        async function initApp() {
            window.showLoader(true, 'Membuka ARIKA...');

            try {
                setDefaultDates();
                setMotivation();

                const formJurnal = document.getElementById('form-arika');
                if(formJurnal && !formJurnal.dataset.listenerAttached) {
                    formJurnal.addEventListener('submit', handleJurnalSubmit);
                    formJurnal.dataset.listenerAttached = 'true';
                }

                const formRencana = document.getElementById('form-rencana-pribadi');
                if(formRencana && !formRencana.dataset.listenerAttached) {
                    formRencana.addEventListener('submit', window.simpanRencanaPribadi);
                    formRencana.dataset.listenerAttached = 'true';
                }

                const formSurvei = document.getElementById('form-survei-arika');
                if(formSurvei && !formSurvei.dataset.listenerAttached) {
                    formSurvei.addEventListener('submit', window.simpanSurveiArika);
                    formSurvei.dataset.listenerAttached = 'true';
                }

                if(typeof window.initSurveyStars === 'function') window.initSurveyStars();

                const quickSession = readLocalSession();
                let sessionRestored = false;
                document.body.classList.add('arika-session-restoring');
                if(quickSession && quickSession.profile) {
                    persistSession(quickSession);
                    window.__ARIKA_RESTORED_SESSION__ = quickSession;
                    loginSetup(quickSession.profile, !!quickSession.isAdmin);
                    window.__ARIKA_RESTORED_SESSION__ = null;
                    sessionRestored = true;
                } else {
                    window.showLoader(true, 'Memulihkan sesi login...');
                    sessionRestored = await resolveWithTimeout(checkSession(), 8600, false);
                    if(!sessionRestored && !window.currentUser) {
                        const lateSession = await resolveWithTimeout(readSessionAnyStorage(), 2800, null);
                        if(lateSession && lateSession.profile) {
                            persistSession(lateSession);
                            window.__ARIKA_RESTORED_SESSION__ = lateSession;
                            loginSetup(lateSession.profile, !!lateSession.isAdmin);
                            window.__ARIKA_RESTORED_SESSION__ = null;
                            sessionRestored = true;
                        }
                    }
                    if(!sessionRestored && !window.currentUser) {
                        window.nav('login-user');
                    }
                }
                document.body.classList.remove('arika-session-restoring');

                // Tampilkan data cache secepat mungkin. Jika cache cloud lambat, lanjutkan tanpa menahan layar.
                try {
                    window.showLoader(true, 'Menyiapkan data tersimpan...');
                    let cacheShown = hydrateFromCoreCache({ force: false });
                    if(!cacheShown && window.currentUser) {
                        const cloudCache = await resolveWithTimeout(restoreDataCacheFromCloud(), 900, null);
                        if(cloudCache) cacheShown = hydrateFromCoreCache({ force: true });
                    }
                    if(cacheShown) updateSyncStatus('Data tersimpan tampil', 'warn');
                } catch(err) {
                    console.warn('Cache awal dilewati:', err);
                }

                setDefaultDates();
                window.renderPengumumanBoard && window.renderPengumumanBoard();
                window.renderRencanaPribadi && window.renderRencanaPribadi();
                window.renderAgendaSaya && window.renderAgendaSaya();
                window.renderSurveiPegawai && window.renderSurveiPegawai();
            } catch(err) {
                console.error('Init ARIKA gagal:', err);
                try {
                    window.nav('login-user');
                } catch(navErr) {
                    console.warn('Gagal membuka halaman login:', navErr);
                }
            } finally {
                // Failsafe utama: loader harus hilang meskipun ada error/timeout.
                window.showLoader(false);
                try { clearTimeout(window.__ARIKA_BOOT_HARD_FAILSAFE__); } catch(e) {}

                try {
                    scheduleBackgroundDataSync('init');
                } catch(syncErr) {
                    console.warn('Auto sync awal dilewati:', syncErr);
                }
            }
        }

        // Failsafe tambahan: bila browser memblokir IndexedDB/fetch dan init tersendat,
        // overlay akan dilepas agar pengguna tetap bisa melihat halaman login.
        const arikaBootFailsafeTimer = setTimeout(() => {
            const loader = document.getElementById('global-loader');
            const loginView = document.getElementById('view-login-user');
            if(loader && loader.style.display !== 'none' && !window.currentUser) {
                console.warn('Boot failsafe aktif: loader dilepas otomatis.');
                try { window.nav('login-user'); } catch(e) {}
                window.showLoader(false);
            }
        }, 7800);

        initApp().finally(() => clearTimeout(arikaBootFailsafeTimer));

    

        // --- PUSAT REMINDER MELAYANG ARIKA ---
        const ARIKA_REMINDER_CENTER_READ_KEY = 'arika_reminder_center_read_v1';
        let arikaReminderCenterTimer = null;

        function getArikaReminderCenterReadMap() {
            try { return JSON.parse(localStorage.getItem(ARIKA_REMINDER_CENTER_READ_KEY) || '{}') || {}; } catch(e) { return {}; }
        }

        function setArikaReminderCenterReadMap(map) {
            try { localStorage.setItem(ARIKA_REMINDER_CENTER_READ_KEY, JSON.stringify(map || {})); } catch(e) {}
        }

        function cleanupArikaReminderCenterReadMap(map) {
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000;
            Object.keys(map || {}).forEach(key => {
                if(!map[key] || (now - Number(map[key])) > maxAge) delete map[key];
            });
            return map || {};
        }

        function getArikaReminderCenterIcon(kind) {
            const key = String(kind || '').toLowerCase();
            if(key.includes('review')) return '📝';
            if(key.includes('rencana')) return '✅';
            if(key.includes('agenda')) return '📅';
            if(key.includes('pengumuman')) return '📢';
            if(key.includes('jurnal')) return '📒';
            if(key.includes('urgent')) return '⚠️';
            return '🔔';
        }

        function getArikaReminderCenterEvents() {
            if(!window.currentUser || window.isAdmin) return [];
            if(typeof collectBerandaReminderEvents !== 'function') return [];
            try {
                return (collectBerandaReminderEvents() || []).filter(Boolean).slice(0, 30);
            } catch(e) {
                return [];
            }
        }

        function updateArikaReminderCenter() {
            const fab = document.getElementById('arika-reminder-center-fab');
            const badge = document.getElementById('arika-reminder-center-badge');
            const panel = document.getElementById('arika-reminder-center-panel');
            const list = document.getElementById('arika-reminder-center-list');
            const subtitle = document.getElementById('arika-reminder-center-subtitle');
            const available = !!(window.currentUser && !window.isAdmin);
            if(fab) fab.classList.toggle('hidden', !available);
            if(panel && !available) panel.classList.add('hidden');
            if(!available) return;

            const readMap = cleanupArikaReminderCenterReadMap(getArikaReminderCenterReadMap());
            setArikaReminderCenterReadMap(readMap);
            const events = getArikaReminderCenterEvents();
            const unread = events.filter(ev => !readMap[ev.key]);

            if(fab) fab.classList.toggle('has-reminder', unread.length > 0);
            if(badge) badge.textContent = unread.length > 99 ? '99+' : String(unread.length);
            if(subtitle) {
                subtitle.textContent = events.length
                    ? `${unread.length} reminder belum dibaca dari ${events.length} reminder aktif.`
                    : 'Tidak ada reminder aktif saat ini.';
            }
            if(!list) return;

            if(!events.length) {
                list.innerHTML = `<div class="arika-reminder-center-empty">Tidak ada reminder aktif saat ini. Reminder akan muncul untuk jurnal, catatan atasan, rencana pribadi, pengumuman, dan agenda yang perlu diperhatikan.</div>`;
                return;
            }

            list.innerHTML = events.map(ev => {
                const isRead = !!readMap[ev.key];
                const title = escapeHTML(ev.title || 'Reminder ARIKA');
                const body = escapeHTML(ev.body || ev.speech || 'Ada pengingat ARIKA yang perlu diperhatikan.');
                const icon = getArikaReminderCenterIcon(ev.kind);
                const meta = isRead ? 'Ditandai Dibaca' : 'Belum Dibaca';
                return `
                    <div class="arika-reminder-center-item ${isRead ? 'read' : ''}">
                        <div class="arika-reminder-center-item-icon">${icon}</div>
                        <div>
                            <h4 class="arika-reminder-center-item-title">${title}</h4>
                            <p class="arika-reminder-center-item-body">${body}</p>
                            <span class="arika-reminder-center-item-meta">${isRead ? '✓' : '•'} ${meta}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        window.toggleArikaReminderCenter = function() {
            const panel = document.getElementById('arika-reminder-center-panel');
            if(!panel) return;
            try { updateArikaReminderCenter(); } catch(e) { console.warn('Pusat Reminder update gagal:', e); }
            panel.classList.remove('arika-open-from-card');
            panel.classList.toggle('hidden');
        };

        window.openArikaReminderCenter = function(options = {}) {
            const panel = document.getElementById('arika-reminder-center-panel');
            if(!panel) return;
            try { updateArikaReminderCenter(); } catch(e) { console.warn('Pusat Reminder update gagal:', e); }
            if(options && options.fromCard) panel.classList.add('arika-open-from-card');
            else panel.classList.remove('arika-open-from-card');
            panel.classList.remove('hidden');
            try {
                const closeBtn = panel.querySelector('.arika-reminder-center-close');
                if(closeBtn) setTimeout(() => closeBtn.focus({ preventScroll: true }), 80);
            } catch(e) {}
        };

        window.openArikaReminderCenterFromCard = function() {
            window.openArikaReminderCenter({ fromCard: true });
        };

        // Listener cadangan agar tombol tetap bekerja meskipun inline onclick terlambat dimuat.
        document.addEventListener('click', function(e) {
            const target = e.target && e.target.closest ? e.target.closest('#arika-open-reminder-center-btn') : null;
            if(!target) return;
            e.preventDefault();
            if(window.openArikaReminderCenterFromCard) window.openArikaReminderCenterFromCard();
            else {
                const panel = document.getElementById('arika-reminder-center-panel');
                if(panel) {
                    panel.classList.add('arika-open-from-card');
                    panel.classList.remove('hidden');
                }
            }
        }, true);

        window.closeArikaReminderCenter = function() {
            const panel = document.getElementById('arika-reminder-center-panel');
            if(panel) {
                panel.classList.add('hidden');
                panel.classList.remove('arika-open-from-card');
            }
        };

        window.markArikaReminderCenterRead = function() {
            const events = getArikaReminderCenterEvents();
            const map = cleanupArikaReminderCenterReadMap(getArikaReminderCenterReadMap());
            const now = Date.now();
            events.forEach(ev => { if(ev && ev.key) map[ev.key] = now; });
            setArikaReminderCenterReadMap(map);
            updateArikaReminderCenter();
            if(window.showCustomAlert) window.showCustomAlert('Reminder aktif sudah ditandai dibaca. Jika ada reminder baru atau reminder yang berubah, badge akan muncul kembali.');
        };

        window.startArikaReminderCenter = function() {
            updateArikaReminderCenter();
            if(arikaReminderCenterTimer) clearInterval(arikaReminderCenterTimer);
            arikaReminderCenterTimer = setInterval(updateArikaReminderCenter, 30000);
        };

        setInterval(() => {
            try { updateArikaReminderCenter(); } catch(e) {}
        }, 60000);

        // v150: sinkronisasi UI saat disematkan di Google Sites.
        // Local file dan Google Sites memiliki storage/session berbeda; fungsi ini membantu role, pusat reminder,
        // dan bantuan tetap terlihat setelah data user terbaca.
        function arikaIsEmbeddedMode() {
            try { return window.self !== window.top || document.body.classList.contains('arika-embed-mode'); }
            catch(e) { return true; }
        }

        function arikaForceRoleUiSync() {
            try {
                if(!window.currentUser || window.isAdmin) return;
                const merged = (typeof arikaGetEffectivePegawaiProfile === 'function') ? arikaGetEffectivePegawaiProfile(window.currentUser) : window.currentUser;
                if(merged && merged !== window.currentUser) window.currentUser = Object.assign({}, window.currentUser, merged);
                if(typeof isNamedKetuaTim === 'function' && isNamedKetuaTim(window.currentUser)) {
                    window.userRole = 'Ketua Tim';
                    window.isReviewer = true;
                }
                if(typeof isReviewerRoleValue === 'function' && typeof getPegawaiRoleValue === 'function') {
                    const effectiveRole = getPegawaiRoleValue((typeof arikaGetEffectivePegawaiProfile === 'function') ? arikaGetEffectivePegawaiProfile(window.currentUser) : window.currentUser);
                    window.isReviewer = window.isReviewer || isReviewerRoleValue(window.userRole) || isReviewerRoleValue(effectiveRole);
                    if(window.isReviewer && effectiveRole && normalize(effectiveRole) !== 'pegawai') window.userRole = effectiveRole;
                }
                if(typeof configureNavigationForRole === 'function') configureNavigationForRole(!!window.isAdmin);
                if(typeof applyAdminRoleAccess === 'function') applyAdminRoleAccess();
            } catch(e) {}
        }

        function arikaSyncEmbedDock() {
            try {
                if(arikaIsEmbeddedMode()) document.body.classList.add('arika-embed-mode');
                const dock = document.getElementById('arika-embed-dock');
                const hasUser = !!window.currentUser;
                if(dock) dock.classList.toggle('hidden', !(arikaIsEmbeddedMode() && hasUser));

                const helpBtn = document.getElementById('btn-arika-help-wa');
                if(helpBtn && hasUser) helpBtn.classList.remove('hidden');

                const fab = document.getElementById('arika-reminder-center-fab');
                if(fab && hasUser && !window.isAdmin) fab.classList.remove('hidden');

                const roleBtn = document.getElementById('arika-embed-role-btn');
                const canRole = !!(hasUser && !window.isAdmin && typeof canAccessAdminPanel === 'function' && canAccessAdminPanel());
                if(roleBtn) {
                    roleBtn.classList.toggle('hidden', !canRole);
                    if(canRole && typeof getAccessPanelLabel === 'function') roleBtn.textContent = '🛡️ ' + getAccessPanelLabel(window.currentUser);
                }

                const badge = document.getElementById('arika-embed-reminder-badge');
                let count = 0;
                const centerBadge = document.getElementById('arika-reminder-center-badge');
                if(centerBadge && centerBadge.textContent) count = parseInt(centerBadge.textContent, 10) || 0;
                if(!count && typeof getArikaReminderCenterEvents === 'function') count = (getArikaReminderCenterEvents() || []).length;
                if(badge) {
                    badge.textContent = count > 99 ? '99+' : String(count || 0);
                    badge.classList.toggle('hidden', !count);
                }
            } catch(e) {}
        }

        setInterval(function(){
            if(!arikaIsEmbeddedMode() && !window.isReviewer && !window.isAdmin) return;
            arikaForceRoleUiSync();
            arikaSyncEmbedDock();
        }, 5000);
        window.addEventListener('load', function(){
            setTimeout(function(){ arikaForceRoleUiSync(); arikaSyncEmbedDock(); }, 500);
            setTimeout(function(){ arikaForceRoleUiSync(); arikaSyncEmbedDock(); }, 2500);
        });

        // Mode fokus Panduan ARIKA: mengabu-abukan bagian lain saat pengguna memilih topik tertentu.
        window.arikaPanduanFocus = function(sectionId, label, inlineId) {
            var view = document.getElementById('view-panduan');
            var target = document.getElementById(sectionId);
            if (!view || !target) return;

            view.classList.add('panduan-focusing');
            document.querySelectorAll('#view-panduan .panduan-focus-section').forEach(function(section) {
                section.classList.remove('panduan-focused');
            });
            document.querySelectorAll('#view-panduan .panduan-inline-focus').forEach(function(item) {
                item.classList.remove('panduan-inline-focused');
            });

            target.classList.add('panduan-focused');

            var title = document.getElementById('panduan-focus-title');
            var subtitle = document.getElementById('panduan-focus-subtitle');
            if (title) title.textContent = label || 'Mode Fokus Panduan';
            if (subtitle) subtitle.textContent = 'Bagian lain dibuat abu-abu agar pengguna fokus membaca panduan ini.';

            var scrollTarget = target;
            if (inlineId) {
                var inlineTarget = document.getElementById(inlineId);
                if (inlineTarget) {
                    inlineTarget.classList.add('panduan-inline-focused');
                    scrollTarget = inlineTarget;
                }
            }

            setTimeout(function() {
                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        };

        window.arikaPanduanClearFocus = function() {
            var view = document.getElementById('view-panduan');
            if (view) view.classList.remove('panduan-focusing');
            document.querySelectorAll('#view-panduan .panduan-focus-section').forEach(function(section) {
                section.classList.remove('panduan-focused');
            });
            document.querySelectorAll('#view-panduan .panduan-inline-focus').forEach(function(item) {
                item.classList.remove('panduan-inline-focused');
            });
        };

        window.arikaPanduanBackTop = function() {
            window.arikaPanduanClearFocus();
            var top = document.getElementById('panduan-top') || document.getElementById('view-panduan');
            if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        // v135: Ringkasan visual Beranda Modern
        function setHomeModernText(id, value) {
            const el = document.getElementById(id);
            if(el) el.textContent = value;
        }

        function isArikaLemburRow(row) {
            if(!row) return false;
            if(row.isLembur === true) return true;
            const raw = String(row.isLembur || row.lembur || row['Lembur?'] || row['Kegiatan Lembur'] || '').toLowerCase().trim();
            return ['true', 'ya', 'iya', '1', 'lembur', 'checked', 'centang'].includes(raw);
        }

        function updateHomeModernStats() {
            try {
                const now = new Date();
                const month = (typeof getCurrentMonth === 'function') ? getCurrentMonth() : now.toISOString().slice(0, 7);
                const dateLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
                setHomeModernText('arika-home-date-label', dateLabel);

                const allRows = Array.isArray(window.arikaData) ? window.arikaData : [];
                const personalRows = (window.currentUser && !window.isAdmin)
                    ? allRows.filter(row => {
                        try { return typeof personMatchesRow === 'function' ? personMatchesRow(row, window.currentUser) : normalize(row.name) === normalize(window.currentUser.nama); }
                        catch(e) { return false; }
                    })
                    : allRows;

                const monthRows = personalRows.filter(row => String(row.date || '').slice(0, 7) === month);
                const lemburRows = monthRows.filter(isArikaLemburRow);

                let activePlans = 0;
                try {
                    activePlans = (window.rencanaData || []).filter(item => {
                        const mine = typeof isCurrentUserRencana === 'function' ? isCurrentUserRencana(item) : true;
                        const done = typeof isRencanaSelesai === 'function' ? isRencanaSelesai(item) : String(item.status || '').toLowerCase().includes('selesai');
                        return mine && !done;
                    }).length;
                } catch(e) { activePlans = 0; }

                let pendingReviews = 0;
                try {
                    const reviewRows = typeof getMyReviewedJurnalRowsForAlert === 'function' ? getMyReviewedJurnalRowsForAlert() : [];
                    pendingReviews = reviewRows.filter(row => typeof isJurnalReviewNeedsFollowUp === 'function' ? isJurnalReviewNeedsFollowUp(row) : true).length;
                } catch(e) { pendingReviews = 0; }

                setHomeModernText('home-stat-jurnal-bulan', String(monthRows.length));
                setHomeModernText('home-stat-lembur-bulan', String(lemburRows.length));
                setHomeModernText('home-stat-rencana-aktif', String(activePlans));
                setHomeModernText('home-stat-catatan-aktif', String(pendingReviews));

                const status = document.getElementById('arika-home-mini-status');
                if(status) {
                    const roleLabel = window.isAdmin ? 'Admin Utama' : (typeof getAccessPanelLabel === 'function' ? getAccessPanelLabel(window.currentUser || {}) : 'Pegawai');
                    const lab = (window.currentUser && window.currentUser.lab) ? window.currentUser.lab : 'Unit kerja';
                    status.innerHTML = `
                        <span>🟢 ${escapeHTML(roleLabel || 'Pegawai')}</span>
                        <span>🏷️ ${escapeHTML(lab || 'Unit kerja')}</span>
                        <span id="sync-status" onclick="window.fetchCloudData()" class="cursor-pointer">↻ Sinkron data</span>
                    `;
                }
            } catch(err) {
                console.warn('Gagal memperbarui ringkasan Beranda:', err);
            }
        }

        setInterval(() => {
            if(window.currentUser && document.getElementById('view-beranda') && !document.getElementById('view-beranda').classList.contains('hidden')) {
                updateHomeModernStats();
            }
        }, 30000);

        // v143: Fungsi lompat cepat Beranda dipindahkan ke main script.
        // Perbaikan ini mencegah tag script ikut tercetak sebagai teks di halaman.
        window.scrollToHomeSection = window.scrollToHomeSection || function(sectionId) {
            try {
                var target = document.getElementById(sectionId);
                if (!target) return;
                target.classList.remove('arika-home-section-highlight');
                var stickyOffset = 96;
                var top = target.getBoundingClientRect().top + window.pageYOffset - stickyOffset;
                window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                setTimeout(function(){
                    target.classList.add('arika-home-section-highlight');
                }, 280);
                setTimeout(function(){
                    target.classList.remove('arika-home-section-highlight');
                }, 2300);
            } catch (err) {
                var fallback = document.getElementById(sectionId);
                if (fallback) fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
