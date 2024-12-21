use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, transfer_checked, TransferChecked, CloseAccount, close_account, Mint, TokenInterface};

declare_id!("6tgjvHkFUUUbbacEWg225H6AazxoSTso8ix9vkXFScTU");

pub const PDA_SEED: &[u8] = b"userPdaVault";

#[program]
pub mod raydium_automation {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }

    pub fn create_pda(ctx: Context<CreatePDA>, owner: Pubkey, bump: u8) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;
        pda_account.owner = owner;
        pda_account.bump = bump;
        Ok(())
    }

    pub fn transfer_lamports(ctx: Context<TransferLamports>, amount: u64) -> Result<()> {
        // PDA signer seeds
        ctx.accounts.pda_account.sub_lamports(amount)?;
        ctx.accounts.to.add_lamports(amount)?;
        Ok(())
    }

    pub fn transfer_spl(ctx: Context<TransferSpl>, amount: u64) -> Result<()> {
        // PDA signer seeds
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            PDA_SEED,
            user.as_ref(),
            &[ctx.accounts.pda_account.bump],
        ]];

        let source = &ctx.accounts.from_ata;
        let destination = &ctx.accounts.to_ata;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.pda_account;
        let program_id = token_program.to_account_info();
        let mint = &ctx.accounts.mint;

        let cpi_context = CpiContext::new(
            program_id,
            TransferChecked {
                from: source.to_account_info(),
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: authority.to_account_info(),
            },
        )
        .with_signer(signer_seeds);

        transfer_checked(cpi_context, amount, mint.decimals)?;
        Ok(())
    }

    pub fn withdraw_token(ctx: Context<WithdrawToken>) -> Result<()> {
        // PDA signer seeds
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            PDA_SEED,
            user.as_ref(),
            &[ctx.accounts.pda_account.bump],
        ]];

        let destination = &ctx.accounts.to_token_account;
        let source = &ctx.accounts.from_token_account;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.pda_account;
        let program_id = token_program.to_account_info();
        let amount = ctx.accounts.from_token_account.amount;
        let mint = &ctx.accounts.mint;

        let cpi_context = CpiContext::new(
            program_id,
            TransferChecked {
                from: source.to_account_info(),
                to: destination.to_account_info(),
                authority: authority.to_account_info(),
                mint: mint.to_account_info(),
            },
        )
        .with_signer(signer_seeds);

        transfer_checked(cpi_context, amount, mint.decimals)?;

        Ok(())
    }

    pub fn withdraw_token_and_close(ctx: Context<WithdrawTokenAndClose>) -> Result<()> {
        // PDA signer seeds
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            PDA_SEED,
            user.as_ref(),
            &[ctx.accounts.pda_account.bump],
        ]];

        let to_token_account = &ctx.accounts.to_token_account;
        let destination = &ctx.accounts.destination;
        let source = &ctx.accounts.from_token_account;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.pda_account;
        let program_id = token_program.to_account_info();
        let amount = ctx.accounts.from_token_account.amount;
        let mint = &ctx.accounts.mint;

        let cpi_context = CpiContext::new(
            program_id.clone(),
            TransferChecked {
                from: source.to_account_info(),
                to: to_token_account.to_account_info(),
                authority: authority.to_account_info(),
                mint: mint.to_account_info(),
            },
        )
        .with_signer(signer_seeds);

        transfer_checked(cpi_context, amount, mint.decimals)?;

        let cpi_context_close_account = CpiContext::new(
            program_id.clone(),
            CloseAccount {
                account: source.to_account_info(),
                destination: destination.to_account_info(),
                authority: authority.to_account_info(),
            },
        )
        .with_signer(signer_seeds);

        close_account(cpi_context_close_account)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct CreatePDA<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        space = 8 + 64, // 8 bytes for discriminator, 32 bytes for Pubkey
        seeds = [PDA_SEED, user.key().as_ref()],
        bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Debug)]
pub struct PDAAccount {
    pub owner: Pubkey,
    bump: u8,
}

#[derive(Accounts)]
pub struct TransferLamports<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_SEED, user.key().as_ref()],
        bump = pda_account.bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    /// CHECK: safe
    #[account(mut)]
    pub to: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferSpl<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_SEED, user.key().as_ref()],
        bump = pda_account.bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub from_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub to_ata: InterfaceAccount<'info, TokenAccount>,
    #[account()]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_SEED, user.key().as_ref()],
        bump = pda_account.bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account()]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawTokenAndClose<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_SEED, user.key().as_ref()],
        bump = pda_account.bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: safe
    #[account(mut)]
    pub destination: AccountInfo<'info>,
    #[account()]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum CustomError {
    #[msg("Invalid PDA detected.")]
    InvalidPDA,
}
