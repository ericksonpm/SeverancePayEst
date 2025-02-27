class ServiceDateCalculator {
    static OPM_DAYS_IN_YEAR = 360;
    static OPM_DAYS_IN_MONTH = 30;

    static parseOPMDate(date) {
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1, // JS months are 0-indexed
            day: date.getDate()
        };
    }

    static convertToOPMDays(date) {
        const { year, month, day } = this.parseOPMDate(date);
        return (year * this.OPM_DAYS_IN_YEAR) + 
               ((month - 1) * this.OPM_DAYS_IN_MONTH) + 
               day;
    }

    static convertFromOPMDays(totalDays) {
        const years = Math.floor(totalDays / this.OPM_DAYS_IN_YEAR);
        let remainder = totalDays % this.OPM_DAYS_IN_YEAR;
        const months = Math.floor(remainder / this.OPM_DAYS_IN_MONTH);
        const days = remainder % this.OPM_DAYS_IN_MONTH;
        
        return new Date(
            years,
            months,
            days
        );
    }

    static adjustForLWOP(baseDate, lwopEntries) {
        let adjustmentDays = 0;
        
        lwopEntries.forEach(entry => {
            const start = new Date(entry.start);
            const end = new Date(entry.end);
            const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
            
            if (diffDays > 180) { // 6 months in OPM terms
                adjustmentDays += diffDays - 180;
            }
        });

        return this.convertFromOPMDays(
            this.convertToOPMDays(baseDate) + adjustmentDays
        );
    }
}

class SCDCalculator {
    constructor() {
        this.militaryEntries = [];
        this.lwopEntries = [];
    }

    addMilitaryEntry(entry) {
        this.militaryEntries.push(entry);
    }

    addLWOPEntry(entry) {
        this.lwopEntries.push(entry);
    }

    calculate() {
        const federalEod = new Date(document.getElementById('federalEod').value);
        const breakDays = parseInt(document.getElementById('breakDays').value);
        const performance = parseInt(document.getElementById('performance').value);

        // Calculate military credits
        const militaryCredits = this.militaryEntries.reduce((acc, entry) => {
            const startDays = ServiceDateCalculator.convertToOPMDays(new Date(entry.start));
            const endDays = ServiceDateCalculator.convertToOPMDays(new Date(entry.end));
            const totalDays = endDays - startDays;

            acc.leave += totalDays;
            if (entry.buybackPaid || entry.combatZone) {
                acc.retirement += totalDays;
            }
            return acc;
        }, { leave: 0, retirement: 0 });

        // Base calculations
        let leaveSCD = ServiceDateCalculator.convertFromOPMDays(
            ServiceDateCalculator.convertToOPMDays(federalEod) - militaryCredits.leave
        );

        let retirementSCD = ServiceDateCalculator.convertFromOPMDays(
            ServiceDateCalculator.convertToOPMDays(federalEod) - militaryCredits.retirement
        );

        // Apply LWOP adjustments
        retirementSCD = ServiceDateCalculator.adjustForLWOP(retirementSCD, this.lwopEntries);

        // Apply breaks in service
        if (breakDays > 3) {
            const breakAdjustment = Math.floor(breakDays / ServiceDateCalculator.OPM_DAYS_IN_MONTH);
            retirementSCD.setMonth(retirementSCD.getMonth() + breakAdjustment);
        }

        // RIF calculations
        const rifCredit = Math.min(performance * 0.5 * ServiceDateCalculator.OPM_DAYS_IN_YEAR, 20 * ServiceDateCalculator.OPM_DAYS_IN_YEAR);
        const rifSCD = ServiceDateCalculator.convertFromOPMDays(
            ServiceDateCalculator.convertToOPMDays(leaveSCD) - rifCredit
        );

        return {
            leaveSCD,
            retirementSCD,
            tspSCD: new Date(federalEod.setFullYear(federalEod.getFullYear() + 3)),
            rifSCD
        };
    }
}

// UI Management
function createEntry(type) {
    const entry = document.createElement('div');
    entry.className = 'service-entry';
    
    if (type === 'military') {
        entry.innerHTML = `
            <input type="date" class="mil-start">
            <input type="date" class="mil-end">
            <label><input type="checkbox" class="buyback-paid"> Buyback Paid</label>
            <label><input type="checkbox" class="combat-zone"> Combat Zone</label>
        `;
    } else {
        entry.innerHTML = `
            <input type="date" class="lwop-start">
            <input type="date" class="lwop-end">
        `;
    }
    
    return entry;
}

function addMilitaryEntry() {
    const container = document.getElementById('militaryEntries');
    container.appendChild(createEntry('military'));
}

function addLwopEntry() {
    const container = document.getElementById('lwopEntries');
    container.appendChild(createEntry('lwop'));
}

function calculateAllSCDs() {
    const calculator = new SCDCalculator();
    
    // Process military entries
    document.querySelectorAll('.service-entry').forEach(entry => {
        if (entry.querySelector('.mil-start')) {
            calculator.addMilitaryEntry({
                start: entry.querySelector('.mil-start').value,
                end: entry.querySelector('.mil-end').value,
                buybackPaid: entry.querySelector('.buyback-paid').checked,
                combatZone: entry.querySelector('.combat-zone').checked
            });
        } else {
            calculator.addLWOPEntry({
                start: entry.querySelector('.lwop-start').value,
                end: entry.querySelector('.lwop-end').value
            });
        }
    });

    const results = calculator.calculate();
    
    // Display results
    const resultsHTML = `
        <h2>Computation Results</h2>
        <table>
            <thead>
                <tr>
                    <th>SCD Type</th>
                    <th>Estimated Date</th>
                    <th>Key Factors</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Leave SCD</td>
                    <td>${results.leaveSCD.toLocaleDateString()}</td>
                    <td>Includes all military service periods</td>
                </tr>
                <tr>
                    <td>Retirement SCD</td>
                    <td>${results.retirementSCD.toLocaleDateString()}</td>
                    <td>Military buyback + LWOP adjustments</td>
                </tr>
                <tr>
                    <td>TSP Vesting Date</td>
                    <td>${results.tspSCD.toLocaleDateString()}</td>
                    <td>3 years civilian service</td>
                </tr>
                <tr>
                    <td>RIF SCD</td>
                    <td>${results.rifSCD.toLocaleDateString()}</td>
                    <td>Performance credit applied</td>
                </tr>
            </tbody>
        </table>
        
        <div class="disclaimer">
            <h3>Important Notes</h3>
            <ul>
                <li>Combat zone service requires manual verification for buyback exceptions</li>
                <li>LWOP adjustments calculated per OPM 360-day year</li>
                <li>Always confirm with your HR specialist</li>
            </ul>
        </div>
    `;

    document.getElementById('results').innerHTML = resultsHTML;
}
