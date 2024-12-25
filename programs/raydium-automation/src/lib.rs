use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    approve, close_account, revoke, transfer_checked, Approve, CloseAccount, Mint, Revoke,
    TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("6tgjvHkFUUUbbacEWg225H6AazxoSTso8ix9vkXFScTU");

pub const PDA_SEED: &[u8] = b"userPdaVault";
pub const PDA_GLOBAL_STATE_SEED: &[u8] = b"globalState";
pub const ADMIN: Pubkey = pubkey!("BjrVZbbgTuaW9NDegdQg7zN4RK5wHEMNpYhtRRayHtpH");

#[program]
pub mod raydium_automation {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }

    pub fn create_pda(ctx: Context<CreatePDA>) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;
        pda_account.owner = ctx.accounts.owner.key();
        pda_account.bump = ctx.bumps.pda_account;
        Ok(())
    }

    pub fn create_global_state(ctx: Context<CreateGlobalState>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.admin = ADMIN;
        global_state.bump = ctx.bumps.global_state;
        global_state.operators.push(ADMIN);
        Ok(())
    }

    pub fn modify_operator(ctx: Context<AddOperatorGlobalState>, operator: Pubkey, add: bool) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        if add {
            global_state.operators.push(operator);
        } else {
            global_state.operators.retain(|&x| x != operator);
        }
        Ok(())
    }

    pub fn transfer_lamports(ctx: Context<TransferLamports>, amount: u64) -> Result<()> {
        // PDA signer seeds
        ctx.accounts.pda_account.sub_lamports(amount)?;
        ctx.accounts.to.add_lamports(amount)?;
        Ok(())
    }

    pub fn transfer_with_operator(ctx: Context<TransferWithOperator>, amount: u64) -> Result<()> {
        // PDA signer seeds
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_SEED, user.as_ref(), &[ctx.accounts.pda_account.bump]]];

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

    pub fn transfer_spl(ctx: Context<TransferSpl>, amount: u64) -> Result<()> {
        // PDA signer seeds
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_SEED, user.as_ref(), &[ctx.accounts.pda_account.bump]]];

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

    pub fn approve_token(ctx: Context<ApproveToken>, amount: u64) -> Result<()> {
        // PDA signer seeds
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_SEED, user.as_ref(), &[ctx.accounts.pda_account.bump]]];

        let token_account = &ctx.accounts.token_account;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.pda_account;
        let program_id = token_program.to_account_info();
        let delegate = &ctx.accounts.delegate;

        let cpi_context = CpiContext::new(
            program_id,
            Approve {
                to: token_account.to_account_info(),
                authority: authority.to_account_info(),
                delegate: delegate.to_account_info(),
            },
        )
        .with_signer(signer_seeds);

        approve(cpi_context, amount)?;

        Ok(())
    }

    pub fn revoke_approval(ctx: Context<RevokeDelegateToken>) -> Result<()> {
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_SEED, user.as_ref(), &[ctx.accounts.pda_account.bump]]];

        let token_account = &ctx.accounts.token_account;
        let token_program = &ctx.accounts.token_program;
        let delegate = &ctx.accounts.delegate;
        let program_id = token_program.to_account_info();

        let cpi_context = CpiContext::new(
            program_id,
            Revoke {
                source: token_account.to_account_info(),
                authority: delegate.to_account_info(),
            },
        )
        .with_signer(signer_seeds);

        revoke(cpi_context)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct CreatePDA<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK
    #[account()]
    pub owner: AccountInfo<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 64, // 8 bytes for discriminator, 32 bytes for Pubkey
        seeds = [PDA_SEED, owner.key().as_ref()],
        bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateGlobalState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 64 + 160, // 8 bytes for discriminator, 32 bytes for Pubkey, 160 bytes for operators
        seeds = [PDA_GLOBAL_STATE_SEED],
        bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddOperatorGlobalState<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_GLOBAL_STATE_SEED],
        bump = global_state.bump,
        constraint = global_state.admin == user.key(),
    )]
    pub global_state: Account<'info, GlobalState>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Debug)]
pub struct PDAAccount {
    pub owner: Pubkey,
    bump: u8,
}

#[account]
#[derive(Debug)]
pub struct GlobalState {
    pub admin: Pubkey,
    bump: u8,
    pub operators: Vec<Pubkey>,
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
pub struct TransferWithOperator<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    /// CHECK: safe
    #[account()]
    pub user: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [PDA_SEED, user.key().as_ref()],
        bump = pda_account.bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(
        seeds = [PDA_GLOBAL_STATE_SEED],
        bump = global_state.bump,
        constraint = global_state.operators.iter().any(|&x| x == operator.key()),
    )]
    pub global_state: Account<'info, GlobalState>,
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

#[derive(Accounts)]
pub struct ApproveToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_SEED, user.key().as_ref()],
        bump = pda_account.bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK
    #[account()]
    pub delegate: AccountInfo<'info>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RevokeDelegateToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_SEED, user.key().as_ref()],
        bump = pda_account.bump,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK
    #[account()]
    pub delegate: AccountInfo<'info>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum CustomError {
    #[msg("Invalid PDA detected.")]
    InvalidPDA,
}
