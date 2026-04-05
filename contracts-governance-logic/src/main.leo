program governance_logic_tests.aleo {
    @noupgrade
    async constructor() {}

    transition noop() -> u8 {
        return 0u8;
    }
}
