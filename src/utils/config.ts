export const getInlineKeyboard = (t: any) => [
    [
        { text: t('buttons.generate_wallets'), callback_data: 'menu_generate_wallets' },
        { text: t('buttons.my_wallets'), callback_data: 'menu_my_wallets' },
    ], [
        { text: t('buttons.mint'), callback_data: 'menu_mint' },
        { text: t('buttons.refund'), callback_data: 'menu_refund' },
    ], [
        { text: t('buttons.language'), callback_data: 'menu_language' },
        { text: t('buttons.help'), callback_data: 'menu_help' },
    ],
]