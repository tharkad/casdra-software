// Tunable numbers for the Rival's policy. sim/ (sub-project 3) searches over these; the baseline
// ships hand-picked values. Card values are "how much do I want this", before cost.
export const DEFAULT_WEIGHTS = {
    xeStored: 10, xeInHand: 3, junkInHand: 2.4, money: 0.5, contractDone: 6,
    costWeight: 0.55, buyThreshold: 0.5, installVp: 1.2,
    contractVp: 1.0, contractMoney: 0.6, contractXe: 0.9, instantContract: 3,
    pipeline: [5.5, 4.5, 3.5],
    wipeMinMoney: 7, wipeBelowValue: 2.2,
    upgrade: {
        heat_exchanger: 4.5, molecular_sieve: 5, desiccant_bed: 3.2, cold_turbine: 4.2,
        packed_tower: 3.8, sales_director: 4.6, spotless_audit: 4.6,
        reserve_fund: 3.4, deal_maker: 2.4, floor_broker: 3.2, account_manager: 2.6,
        sampling_port: 2.4, cryo_chiller: 2.8,
        gas_reclaimer: 2.2, flow_regulator: 2.6, shift_engineer: 1.8,
        freelance_fitter: 1.8, procurement_agent: 1.6,
    },
};
