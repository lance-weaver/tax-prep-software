/************************************************************************/
/* taxsolve_f2441.c -                                                   */
/* Contributed by Rylan Luke, 2/2025                                    */
/*                                                                      */
/* GNU Public License - GPL:                                            */
/* This program is free software; you can redistribute it and/or        */
/* modify it under the terms of the GNU General Public License as       */
/* published by the Free Software Foundation; either version 2 of the   */
/* License, or (at your option) any later version.                      */
/*                                                                      */
/* This program is distributed in the hope that it will be useful,      */
/* but WITHOUT ANY WARRANTY; without even the implied warranty of       */
/* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU     */
/* General Public License for more details.                             */
/*                                                                      */
/* You should have received a copy of the GNU General Public License    */
/* along with this program; if not, write to the Free Software          */
/* Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA             */
/* 02111-1307 USA.                                                      */
/*                                                                      */
/************************************************************************/

// NOTE: Search for TAXYEAR_DEPENDENT to find likely entries
// which need to be updated for each tax year.

float thisversion=1.01;

#include <stdio.h>
#include <time.h>
#include <string.h>
#include <strings.h>
#include <stdlib.h>
#include <locale.h>
#include <math.h>

#include "taxsolve_routines.c"

typedef struct LIMIT_TABLE {
    double start;   // This is the start of the range for the associated limit. End is defined by next 'start' value in array.
    double limit;   // This sets a maximum limit for some output value
} LIMIT_TABLE, *P_LIMIT_TABLE;

// TAXYEAR_DEPENDENT
// Rate applied based on income table for line 8
LIMIT_TABLE line_8_rate_table[] = {
    { 0,     0.35 },
    { 15000, 0.34 },
    { 17000, 0.33 },
    { 19000, 0.32 },
    { 21000, 0.31 },
    { 23000, 0.30 },
    { 25000, 0.29 },
    { 27000, 0.28 },
    { 29000, 0.27 },
    { 31000, 0.26 },
    { 33000, 0.25 },
    { 35000, 0.24 },
    { 37000, 0.23 },
    { 39000, 0.22 },
    { 41000, 0.21 },
    { 43000, 0.20 },
    { -1,     0   },
};

// Limits for part II (credit) and part III (exemption).
double CREDIT_ONE_QP = 3000.00;
double CREDIT_TWO_QP = 6000.00;

// Limits for part III (exemption)
double BENEFIT_LIMIT = 5000.00;
double BENEFIT_LIMIT_MARRIED_SEP = 2500.00;


// Returns a limit value based on an input variable. How the limit is used is up to the caller.
double GetLimit(double val, P_LIMIT_TABLE p_lim_table) {

    // Find row corresponding to the input val
    while (p_lim_table->start != -1.00) {
        // Get next start value; -1.00 means end so inhibit upper bound comparison
        double next_start = (p_lim_table + 1)->start;

        // printf("GetLimit: val: %6.2f, start: %6.2f, next_start: %6.2f, limit: %6.2f\n", 
        //  val, p_lim_table->start, next_start, p_lim_table->limit);
        
        // Check for proper range, and halt if found. If the next_start is -1, don't do the upper bound comparison
        if (val >= p_lim_table->start && ((next_start == -1.0) || val < next_start))
            break;

        // Go to next line in limit table
        ++p_lim_table;
    }

    return p_lim_table->limit;
}

// Associative structure for filing status and internal variables
typedef struct FILING_STATUS_CFG {
    char *status_match_string;
    char *status_label;
    int married_joint;
    int married_sep;
} FILING_STATUS_CFG, *P_FILING_STATUS_CFG;

FILING_STATUS_CFG status_cfg[] = {
   { "Single",        "Single",           0, 0 },
   { "Married/Joint", "Married/Joint",    1, 0 },
   { "Married/Sep",   "Married/Separate", 0, 1 },
   { "Head_of_House", "Head of Household",0, 0 },
   { "Widow",         "Surviving Spouse", 0, 0 },
   { "",              NULL,   },
};


//Get status configuration based on filing status match string, and return it.
P_FILING_STATUS_CFG get_status_cfg(char *status) {
    P_FILING_STATUS_CFG p_cfg;
    p_cfg = status_cfg;
    while (strlen(p_cfg->status_match_string) > 0) {
        if (strstr(status, p_cfg->status_match_string) != NULL)
            return p_cfg;
        ++p_cfg;
    }
    return NULL;
}


//====== Form 1040 Import ======
// Imported form data; add elements as needed, using the same variable name as in the imported form label for clarity.
// Also update 'f1040_imp_defs' to add mapping.

#define NUM_1040_DEP 3

typedef struct FED_1040_IMP_F2441 {
        double L1z;     // Sum of earned income from W2 and other sources
        double L11a;    // AGI (Adjusted gross income)
        double L18;     // Base tax from L16 plus additional tax from L17 
        double S3_1;    // Foreign tax credit
        double S3_6l;   // Amount from Form 8978, line 14
        char *Status;
        char *Your1stName;
        char *YourLastName;
        char *YourSocSec;
        char *Spouse1stName;
        char *SpouseLastName;
        char *SpouseSocSec;
        char *DepFirstName[NUM_1040_DEP];
        char *DepLastName[NUM_1040_DEP];
        char *DepSocSec[NUM_1040_DEP];
} FED_1040_IMP_F2441, PFED_1040_IMP_F2441;

FED_1040_IMP_F2441 f1040i;

// Mapping from label name to address of local data struct element; either double or char*
static FORM_IMPORT_DEF f1040_imp_defs[] = {
        { "L1z",    &f1040i.L1z, NULL },
        { "L11a",   &f1040i.L11a, NULL },
        { "L18",    &f1040i.L18, NULL },
        { "S3_1",   &f1040i.S3_1, NULL },
        { "S3_6l",  &f1040i.S3_6l, NULL },
        { "Status", NULL, &f1040i.Status },
        { "Your1stName:", NULL, &f1040i.Your1stName },
        { "YourLastName:", NULL, &f1040i.YourLastName },
        { "YourSocSec#:", NULL, &f1040i.YourSocSec },
        { "Spouse1stName:", NULL, &f1040i.Spouse1stName },
        { "SpouseLastName:", NULL, &f1040i.SpouseLastName },
        { "SpouseSocSec#:", NULL, &f1040i.SpouseSocSec },
        { "Dep1_FirstName:", NULL, &f1040i.DepFirstName[0] },
        { "Dep1_LastName:", NULL, &f1040i.DepLastName[0] },
        { "Dep1_SocSec#:", NULL, &f1040i.DepSocSec[0] },
        { "Dep2_FirstName:", NULL, &f1040i.DepFirstName[1] },
        { "Dep2_LastName:", NULL, &f1040i.DepLastName[1] },
        { "Dep2_SocSec#:", NULL, &f1040i.DepSocSec[1] },
        { "Dep3_FirstName:", NULL, &f1040i.DepFirstName[2] },
        { "Dep3_LastName:", NULL, &f1040i.DepLastName[2] },
        { "Dep3_SocSec#:", NULL, &f1040i.DepSocSec[2] },
};

int f1040_imp_defs_size = sizeof(f1040_imp_defs)/sizeof(FORM_IMPORT_DEF);

// Schedule SE import definitions
typedef struct SCH_SE_IMP_F2441 {
    char *Name;   // Name on Schedule SE
    double L3;    // Income including Schedule C and Schedule K
    double L4b;   // Optional income methods, sum of Line 15 and 17
    double L5a;   // Church employee income reported on W2
    double L13;   // Deduction for one-half of self-employment tax
} SCH_SE_IMP_F2441, PSCH_SE_IMP_F2441;

// Your schedule SE import data
SCH_SE_IMP_F2441 sch_se_yours;

// Mapping from label name to address of local data struct element; either double or char*
static FORM_IMPORT_DEF sch_se_yours_imp_defs[] = {
        { "YourName:", NULL, &sch_se_yours.Name },
        { "L3",   &sch_se_yours.L3, NULL },
        { "L4b",  &sch_se_yours.L4b, NULL },
        { "L5a",  &sch_se_yours.L5a, NULL },
        { "L13",  &sch_se_yours.L13, NULL },
};
int sch_se_yours_imp_defs_size = sizeof(sch_se_yours_imp_defs)/sizeof(FORM_IMPORT_DEF);


// Spouse schedule SE import data
SCH_SE_IMP_F2441 sch_se_spouse;

static FORM_IMPORT_DEF sch_se_spouse_imp_defs[] = {
        { "YourName:", NULL, &sch_se_spouse.Name },
        { "L3",   &sch_se_spouse.L3, NULL },
        { "L4b",  &sch_se_spouse.L4b, NULL },
        { "L5a",  &sch_se_spouse.L5a, NULL },
        { "L13",  &sch_se_spouse.L13, NULL },
};
int sch_se_spouse_imp_defs_size = sizeof(sch_se_spouse_imp_defs)/sizeof(FORM_IMPORT_DEF);


typedef struct CARE_PROVIDER {
    char *name;
    char *addr_line1;
    char *addr_line2;
    char *SSN_EIN;
    int household_employee;
    double amount;
} CARE_PROVIDER, *PCARE_PROVIDER;

typedef struct QUALIFIED_PERSON {
    int dep_1040_import;
    char *first_name;
    char *last_name;
    char *SSN;
    int over_12_disabled;
    double qualified_expenses;
} QUALIFIED_PERSON, *PQUALIFIED_PERSON;

// Format and print a social security number to the output file, inserting
// dashes, and ignoring any input characters (e.g. ' ' or '-') which are not
// numeric digits. The f1040 output file contains dependent SSN values which
// have had spaces and dashes removed, which then look like numeric values,
// and so have commas inserted.
void show_ssn_f2441(char *label, char *ssn) {
    fprintf(outfile, "%s ", label);
    int cpos;
    int digit_pos = 0;  // Position counting digits only in input number
    for (cpos = 0; cpos < strlen(ssn); ++cpos) {
        // Skip over any non-digit characters, and don't count them as
        // digit_pos
        if (isdigit(*(ssn + cpos))) {
            // If we have reached the third or fifth digit (zero-based),
            // insert a dash beforehand.
            if ((digit_pos == 3) || (digit_pos == 5))
                fputc('-', outfile);
            fputc(*(ssn + cpos), outfile);
            ++digit_pos;
        }
    }
    fputc('\n', outfile);
}

int main( int argc, char *argv[] )
{
    int i, j, k;
    char word[6000], outfname[6000], *infname=0;
    time_t now;
    // Local line number variables for direct/indirect lines
    
    printf("2025 Form 2441 Child and Dependent Care Expenses - v%3.2f\n", thisversion);
    
    /* Decode any command-line arguments. */
    i = 1;  k=1;
    while (i < argc) {
        if (strcmp(argv[i],"-verbose")==0)  { 
            verbose = 1; 
        } else if (k==1) {
            infname = strdup(argv[i]);
            infile = fopen(infname,"r");
            if (infile==0) {
                printf("ERROR: Parameter file '%s' could not be opened.\n", infname ); 
                exit(1);
            }
            k = 2;
            /* Base name of output file on input file. */
            strcpy(outfname,infname);
    
            j = strlen(outfname)-1;
    
            while ((j>=0) && (outfname[j]!='.')) 
                j--;
    
            if (j<0) 
                strcat(outfname,"_out.txt"); 
            else 
                strcpy(&(outfname[j]),"_out.txt");
            outfile = fopen(outfname,"w");
            if (outfile==0) {
                printf("ERROR: Output file '%s' could not be opened.\n", outfname); 
                exit(1);
            }
            printf("Writing results to file:  %s\n", outfname);
        } else {
            printf("Unknown command-line parameter '%s'\n", argv[i]); 
            exit(1);
        }
        i = i + 1;
    }
    if (infile==0) {
        printf("Error: No input file on command line.\n"); 
        exit(1);
    }
    
    /* Pre-initialize all lines to zeros. */
    for (i=0; i<MAX_LINES; i++) { L[i] = 0.0; }
    
    /* Accept Form's "Title" line, and put out with date-stamp for your records. */
    read_line( infile, word );
    now = time(0);
    fprintf(outfile,"\n%s,  v%2.2f, %s\n", word, thisversion, ctime( &now ));
    check_form_version( word, "Title: 2025 Form 2441" );
    
    char *f1040_filename = GetTextLine("FileName1040:") ;

    if (strlen(f1040_filename) != 0) {
        IMPORT_STATUS imp_stat = ImportReturnData( f1040_filename, f1040_imp_defs, f1040_imp_defs_size);

        if (imp_stat.err != IMPORT_ERR_SUCCESS) {
            ImportPrintStatus(outfile, "Form 1040", imp_stat);
            exit(1);
        }

        fprintf( outfile, "INFO: --- Imported 1040 Data from file '%s' ---\n", f1040_filename);
        fprintf( outfile, "INFO: f1040i.L1z   = %9.2f -- Sum of earned income from W2 and other sources\n", f1040i.L1z);
        fprintf( outfile, "INFO: f1040i.L11a  = %9.2f -- AGI (Adjusted gross income)\n", f1040i.L11a);
        fprintf( outfile, "INFO: f1040i.L18   = %9.2f -- Base tax from L16 plus additional tax from L17\n", f1040i.L18);
        fprintf( outfile, "INFO: f1040i.S3_1  = %9.2f -- Foreign tax credit\n", f1040i.S3_1);
        fprintf( outfile, "INFO: f1040i.S3_6l = %9.2f -- Amount from Form 8978, line 14\n", f1040i.S3_6l);
        fprintf( outfile, "INFO: f1040i.Status:  = '%s'\n", f1040i.Status);
        fprintf( outfile, "INFO: f1040i.Your1stName:  = '%s'\n", f1040i.Your1stName);
        fprintf( outfile, "INFO: f1040i.YourLastName:  = '%s'\n", f1040i.YourLastName);
        fprintf( outfile, "INFO: f1040i.YourSocSec#:  = '%s'\n", f1040i.YourSocSec);
        fprintf( outfile, "INFO: f1040i.Spouse1stName:  = '%s'\n", f1040i.Spouse1stName);
        fprintf( outfile, "INFO: f1040i.SpouseLastName:  = '%s'\n", f1040i.SpouseLastName);
        fprintf( outfile, "INFO: f1040i.SpouseSocSec#:  = '%s'\n", f1040i.SpouseSocSec);
        fprintf( outfile, "INFO: f1040i.Dep1FirstName:  = '%s'\n", f1040i.DepFirstName[0]);
        fprintf( outfile, "INFO: f1040i.Dep1LastName:  = '%s'\n", f1040i.DepLastName[0]);
        fprintf( outfile, "INFO: f1040i.Dep1SocSec:  = '%s'\n", f1040i.DepSocSec[0]);
        fprintf( outfile, "INFO: f1040i.Dep2FirstName:  = '%s'\n", f1040i.DepFirstName[1]);
        fprintf( outfile, "INFO: f1040i.Dep2LastName:  = '%s'\n", f1040i.DepLastName[1]);
        fprintf( outfile, "INFO: f1040i.Dep2SocSec:  = '%s'\n", f1040i.DepSocSec[1]);
        fprintf( outfile, "INFO: f1040i.Dep3FirstName:  = '%s'\n", f1040i.DepFirstName[2]);
        fprintf( outfile, "INFO: f1040i.Dep3LastName:  = '%s'\n", f1040i.DepLastName[2]);
        fprintf( outfile, "INFO: f1040i.Dep3SocSec:  = '%s'\n", f1040i.DepSocSec[2]);
    } else {
        fprintf( outfile, "ERROR: --- No Imported 1040 Form Data : no filename provided ---\n");
        exit(1);
    }




    //=== Filing Status ===
    // Filing status configuration pointer.
    P_FILING_STATUS_CFG p_cfg = get_status_cfg(f1040i.Status);

    if (p_cfg == NULL) {
        fprintf(outfile,"ERROR: unrecognized filing status '%s'. Check form1040 imported info. Exiting.\n", f1040i.Status); 
        exit(1);
    }

    fprintf(outfile, "INFO: Filing_status: '%s'\n", p_cfg->status_label);
    

    //====== Page 1 ======
    // Include both names if married filing jointly
    if (p_cfg->married_joint) {
        fprintf(outfile, "YourName: %s %s and %s %s\n", f1040i.Your1stName, f1040i.YourLastName, f1040i.Spouse1stName, f1040i.SpouseLastName);
    } else {
        fprintf(outfile, "YourName: %s %s\n", f1040i.Your1stName, f1040i.YourLastName);
    }
    show_ssn_f2441("YourSSN:", f1040i.YourSocSec);

    int bCkA;
    GetYesNoSL("CkA", &bCkA);
    int bCkB;
    GetYesNoSL("CkB", &bCkB);

    if (bCkA)
        fprintf(outfile, "CkA X\n");

    if (bCkB)
        fprintf(outfile, "CkB X\n");

    double num_care_providers;
    GetLine("NumCP", &num_care_providers);
    if (num_care_providers > 3) {
        fprintf(outfile, "Ck_L1_plus_3_cp X\n");
    }

    // Buffer for formatting indexed labels, for input and output
    char label_buf[128];
    int idx;

    // Iterate through 3 possible care providers
    #define NUM_CP_ON_FORM 3
    CARE_PROVIDER cp[NUM_CP_ON_FORM];

    // Buffers for splitting care provider name into 2 lines.
    #define NAME_SPLIT_STRING_SIZE 256
    char name_line_1_buf[NAME_SPLIT_STRING_SIZE + 1];
    char name_line_2_buf[NAME_SPLIT_STRING_SIZE + 1];

    for (idx = 0; idx < NUM_CP_ON_FORM; ++idx) {
        // One-based index
        int idx1 = idx + 1;

        // Read values from input file
        PCARE_PROVIDER pc = &cp[idx];
        sprintf(label_buf, "L1_a_r%0d:", idx1);
        pc->name = GetTextLine(label_buf);
        sprintf(label_buf, "L1_b_r%0d_line1:", idx1);
        pc->addr_line1 = GetTextLine(label_buf);
        sprintf(label_buf, "L1_b_r%0d_line2:", idx1);
        pc->addr_line2 = GetTextLine(label_buf);
        sprintf(label_buf, "L1_c_r%0d:", idx1);
        pc->SSN_EIN = GetTextLine(label_buf);
        sprintf(label_buf, "Ck_L1_d_r%0d", idx1);
        GetYesNoSL(label_buf, &pc->household_employee);
        sprintf(label_buf, "L1_e_r%0d", idx1);
        GetLine(label_buf, &pc->amount);

        // Process care provider name into 2 lines
        #define MAX_CP_LEN 24    // Number of characters allowed in each line
        int name_len = strlen(pc->name);
        // Check for buffer overflow before strcpy operations.
        if (name_len > NAME_SPLIT_STRING_SIZE) {
            fprintf(outfile, "ERROR: Care provider %d name is longer than %d characters.\n", idx1, NAME_SPLIT_STRING_SIZE);
            exit(1);
        }
        int s = 0;
        if (name_len > MAX_CP_LEN) {
            // Work backwards from end, looking for a space
            // whose position is < MAX_CP_LEN
            s = name_len - 1;
            while (pc->name[s] != ' ' || s > MAX_CP_LEN) {
                if (s > 0) {
                    --s;
                } else {
                    break;
                }
            }
            // Found a space in the right place
            if (pc->name[s] == ' ') {
                // Copy from character after space, to null terminator, to line 2
                if (s < (name_len - 1)) {
                    strcpy(name_line_2_buf, pc->name + s + 1);
                }
                // Copy first part of name, up to space
                strncpy(name_line_1_buf, pc->name, s);
                // Add null terminator
                name_line_1_buf[s] = '\0';
            }
        } 
        // If a space was not found in the first part, or
        // the overall name length fits in the first line,
        // copy the whole name to the first line.
        if ((name_len > MAX_CP_LEN && (s == 0)) || name_len <= MAX_CP_LEN) {
            strcpy(name_line_1_buf, pc->name);
            name_line_2_buf[0] = '\0';
        }

        // Write care providers to output file
        sprintf(label_buf, "L1_a_row_%0d_line_1:", idx1);
        fprintf(outfile, "%s %s\n", label_buf, name_line_1_buf);
        sprintf(label_buf, "L1_a_row_%0d_line_2:", idx1);
        fprintf(outfile, "%s %s\n", label_buf, name_line_2_buf);

        sprintf(label_buf, "L1_b_row_%0d_line_1:", idx1);
        fprintf(outfile, "%s %s\n", label_buf, pc->addr_line1);
        sprintf(label_buf, "L1_b_row_%0d_line_2:", idx1);
        fprintf(outfile, "%s %s\n", label_buf, pc->addr_line2);

        sprintf(label_buf, "L1_c_row_%0d:", idx1);
        fprintf(outfile, "%s %s\n", label_buf, pc->SSN_EIN);

        // If a SSN_EIN has been provided, check one of the boxes
        if (strlen(pc->SSN_EIN)) {
            if (pc->household_employee) {
                sprintf(label_buf, "Ck_L1_d_row_%0d_Yes", idx1);
                fprintf(outfile, "%s X\n", label_buf);
            } else {
                sprintf(label_buf, "Ck_L1_d_row_%0d_No", idx1);
                fprintf(outfile, "%s X\n", label_buf);
            }
        }
        sprintf(label_buf, "L1_e_row_%0d", idx1);
        showline_wlabelnz(label_buf, pc->amount);
    }

    double NumQP;
    GetLine("NumQP", &NumQP);
    if (NumQP > 3) {
        fprintf(outfile, "Ck_L2 X\n");
    }
    double DepExtraQualExp;
    GetLine("DepExtraQualExp", &DepExtraQualExp);

    if (NumQP <= 3 && DepExtraQualExp > 0.0) {
        fprintf(outfile, "ERROR: The total number of qualifed persons is 3 or less, but DepExtraQualExp is non-zero\n");
        exit(1);
    }

    #define NUM_QP_ON_FORM 3
    QUALIFIED_PERSON qp[NUM_QP_ON_FORM];

    // Totals for all QP
    int num_qualified_persons_entered = 0;
    // Start the running total with any extra dependent expenses.
    double qualified_expenses_sum = DepExtraQualExp;

    for (idx = 0; idx < NUM_QP_ON_FORM; ++idx) {
        // One-based index
        int idx1 = idx + 1;

        // Read values from input file
        PQUALIFIED_PERSON pq = &qp[idx];

        sprintf(label_buf, "CkDep%0dQP", idx1);
        GetYesNoSL(label_buf, &pq->dep_1040_import);

        sprintf(label_buf, "Dep%0dFirstName:", idx1);
        pq->first_name = GetTextLine(label_buf);

        sprintf(label_buf, "Dep%0dLastName:", idx1);
        pq->last_name = GetTextLine(label_buf);

        sprintf(label_buf, "Dep%0dSSN:", idx1);
        pq->SSN = GetTextLine(label_buf);

        sprintf(label_buf, "CkDep%0dDisabled", idx1);
        GetYesNoSL(label_buf, &pq->over_12_disabled);

        sprintf(label_buf, "Dep%0dQualExp", idx1);
        GetLine(label_buf, &pq->qualified_expenses);

        // If importing from f1040, use those values for  first, last, SSN
        if (pq->dep_1040_import) {
            pq->first_name = f1040i.DepFirstName[idx];
            pq->last_name = f1040i.DepLastName[idx];
            pq->SSN = f1040i.DepSocSec[idx];
        }

        // Increment the number of QP, and the total expenses,
        // if any of the fields for this dependent have been entered.
        if (strlen(pq->first_name) || strlen(pq->last_name) || strlen(pq->SSN) || (pq->qualified_expenses > 0.0))
            ++num_qualified_persons_entered;

        qualified_expenses_sum += pq->qualified_expenses;

        // Write qualified persons to output file

        sprintf(label_buf, "L2_a_first_row_%0d:", idx1);
        fprintf(outfile, "%s %s\n", label_buf, pq->first_name);

        sprintf(label_buf, "L2_a_last_row_%0d:", idx1);
        fprintf(outfile, "%s %s\n", label_buf, pq->last_name);

        sprintf(label_buf, "L2_b_row_%0d:", idx1);
        show_ssn_f2441(label_buf, pq->SSN);

        if (pq->over_12_disabled) {
            sprintf(label_buf, "Ck_L2_c_row_%0d", idx1);
            fprintf(outfile, "%s X\n", label_buf);
        }

        sprintf(label_buf, "L2_d_row_%0d", idx1);
        showline_wlabelnz(label_buf, pq->qualified_expenses);
    }

    // Determine number of qualified persons to use for limits
    int num_qual_persons;
    if (NumQP > 3)
        num_qual_persons = NumQP;
    else
        num_qual_persons = num_qualified_persons_entered;

    fprintf(outfile, "INFO: Number of qualified persons = %d\n", num_qual_persons);
    fprintf(outfile, "INFO: Total of qualified expenses = %9.2f\n", qualified_expenses_sum);

    double num_qp_credit_limit = 0.0;
    if (num_qual_persons >= 2)
        num_qp_credit_limit = CREDIT_TWO_QP;
    else if (num_qual_persons == 1)
        num_qp_credit_limit = CREDIT_ONE_QP;

    // Get the rest of the input form data
    char *sch_se_yours_filename = GetTextLine("FileSEYours:") ;

    double YourEISchSE;
    GetLine("YourEISchSE", &YourEISchSE);

    double YourEISchC;
    GetLine("YourEISchC", &YourEISchC);

    double YourNonTaxCP;
    GetLine("YourNonTaxCP", &YourNonTaxCP);

    double SpseEI1040;
    GetLine("SpseEI1040", &SpseEI1040);

    char *sch_se_spouse_filename = GetTextLine("FileSESpouse:") ;

    double SpseEISchSE;
    GetLine("SpseEISchSE", &SpseEISchSE);

    double SpseEISchC;
    GetLine("SpseEISchC", &SpseEISchC);

    double SpseNonTaxCP;
    GetLine("SpseNonTaxCP", &SpseNonTaxCP);

    double SpseEIDisStudent;
    GetLine("SpseEIDisStudent", &SpseEIDisStudent);

    double L9b;
    GetLine("L9b", &L9b);

    GetLine("L12", &L[12]);
    GetLine("L13", &L[13]);
    GetLine("L14", &L[14]);

    double ExtraQualExp;
    GetLine("ExtraQualExp", &ExtraQualExp);

    double L18EISub;
    GetLine("L18EISub", &L18EISub);

    double L19_sep_no_cka;
    GetLine("L19", &L19_sep_no_cka);

    double L19EISub;
    GetLine("L19EISub", &L19EISub);

    double DepPlanBen;
    GetLine("DepPlanBen", &DepPlanBen);

    GetLine("L22", &L[22]);

    // Earned income has 4 possible contributions, from 1040 line 1z, Schedule SE, 
    // Schedule C (statutory employees only), and non taxable combat pay.
    // It is figured separately for you and your spouse.

    //====== Your Earned Income ======
    // Earned Income: 1040 line 1z
    // Subtract the amounts that a spouse contributed, if any,
    // and add to your total earned income. Should not be less than 0.
    double your_ei_1040;
    your_ei_1040 = f1040i.L1z - SpseEI1040; 
    if (your_ei_1040 < 0.0) {
        fprintf( outfile, "ERROR: --- Your Earned Income from 1040 is < 0 because the amount of spousal contribution "
                          "entered in input field SpseEI1040: %4.2f, is greater than the total from line 1z: %4.2f ---\n", 
                          SpseEI1040, f1040i.L1z);
        exit(1);
    }

    // Earned Income: Schedule SE; if a filename was provided, import amounts,
    // else take from input file.

    int se_yours_filename_provided = 0;

    if (strlen(sch_se_yours_filename) != 0) {
        se_yours_filename_provided = 1;
        
        IMPORT_STATUS imp_stat = ImportReturnData( sch_se_yours_filename, sch_se_yours_imp_defs, sch_se_yours_imp_defs_size);

        if (imp_stat.err != IMPORT_ERR_SUCCESS) {
            ImportPrintStatus(outfile, "Your Schedule SE", imp_stat);
            exit(1);
        }

        fprintf( outfile, "INFO: --- Imported your Schedule SE Data from file '%s' ---\n", sch_se_yours_filename);
        fprintf( outfile, "INFO: sch_se_yours.Name: = '%s'\n", sch_se_yours.Name);
        fprintf( outfile, "INFO: sch_se_yours.L3  = %9.2f -- Income including Schedule C and Schedule K\n", sch_se_yours.L3);
        fprintf( outfile, "INFO: sch_se_yours.L4b = %9.2f -- Optional income methods, sum of Line 15 and 17\n", sch_se_yours.L4b);
        fprintf( outfile, "INFO: sch_se_yours.L5a = %9.2f -- Church employee income reported on W2\n", sch_se_yours.L5a);
        fprintf( outfile, "INFO: sch_se_yours.L13 = %9.2f -- Deduction for one-half of self-employment tax\n", sch_se_yours.L13);
    }

    double your_ei_se;
    if (se_yours_filename_provided) {
        your_ei_se = (sch_se_yours.L3 + sch_se_yours.L4b + sch_se_yours.L5a) - sch_se_yours.L13;
        fprintf(outfile, "INFO: Your imported schedule SE earned income: SE.L3 + SE.L4b + SE.L5a - SE.L13 = %4.2f + %4.2f + %4.2f - %4.2f = %4.2f\n", 
            sch_se_yours.L3, sch_se_yours.L4b, sch_se_yours.L5a, sch_se_yours.L13, your_ei_se);
    } else {
        your_ei_se = YourEISchSE;
    }


    double your_ei = your_ei_1040 + your_ei_se + YourEISchC + YourNonTaxCP;

    fprintf(outfile, "INFO: Your earned income: total: %4.2f, 1040 line 1z: %4.2f, schedule SE: %4.2f, schedule C (stat empl): %4.2f, non-taxable combat pay: %4.2f\n", 
        your_ei, your_ei_1040, your_ei_se, YourEISchC, YourNonTaxCP);


    //====== Spouse Earned Income ======
    int se_spouse_filename_provided = 0;
    double spouse_ei = 0.0;

    // Only import from SE file for spouse if married joint or married sep and CkA is checked
    if ((p_cfg->married_joint || (p_cfg->married_sep && bCkA))) {
        if (strlen(sch_se_spouse_filename) != 0) {
            se_spouse_filename_provided = 1;
            
            IMPORT_STATUS imp_stat = ImportReturnData( sch_se_spouse_filename, sch_se_spouse_imp_defs, sch_se_spouse_imp_defs_size);

            if (imp_stat.err != IMPORT_ERR_SUCCESS) {
                ImportPrintStatus(outfile, "Spouse Schedule SE", imp_stat);
                exit(1);
            }

            fprintf( outfile, "INFO: --- Imported spouse Schedule SE Data from file '%s' ---\n", sch_se_spouse_filename);
            fprintf( outfile, "INFO: sch_se_spouse.Name:  = '%s'\n", sch_se_spouse.Name);
            fprintf( outfile, "INFO: sch_se_spouse.L3  = %9.2f -- Income including Schedule C and Schedule K\n", sch_se_spouse.L3);
            fprintf( outfile, "INFO: sch_se_spouse.L4b = %9.2f -- Optional income methods, sum of Line 15 and 17\n", sch_se_spouse.L4b);
            fprintf( outfile, "INFO: sch_se_spouse.L5a = %9.2f -- Church employee income reported on W2\n", sch_se_spouse.L5a);
            fprintf( outfile, "INFO: sch_se_spouse.L13 = %9.2f -- Deduction for one-half of self-employment tax\n", sch_se_spouse.L13);
        }

        // Earned Income: Schedule SE; if a filename was provided, import amounts,
        // else take from input file.
        double spouse_ei_se;
        if (se_spouse_filename_provided) {
            spouse_ei_se = (sch_se_spouse.L3 + sch_se_spouse.L4b + sch_se_spouse.L5a) - sch_se_spouse.L13;
            fprintf(outfile, "INFO: Spouse imported schedule SE earned income: SE.L3 + SE.L4b + SE.L5a - SE.L13 = %4.2f + %4.2f + %4.2f - %4.2f = %4.2f\n", 
                sch_se_spouse.L3, sch_se_spouse.L4b, sch_se_spouse.L5a, sch_se_spouse.L13, spouse_ei_se);
        } else {
            spouse_ei_se = SpseEISchSE;
        }

        spouse_ei = SpseEI1040 + spouse_ei_se + SpseEISchC + SpseNonTaxCP + SpseEIDisStudent;

        fprintf(outfile, "INFO: Spouse earned income: total: %4.2f, 1040 line 1z: %4.2f, schedule SE: %4.2f, schedule C (stat empl): %4.2f, non-taxable combat pay: %4.2f, disabled or student EI: %4.2f\n", 
            spouse_ei, SpseEI1040, spouse_ei_se, SpseEISchC, SpseNonTaxCP, SpseEIDisStudent);
    }
    


    // Now we skip forward to part III, and complete it, as it is needed before
    // we can calculate part II.

    //====== Part III Dependent Care Benefits ======

    // Only produce Part III output if dependent care benefits were received
    // Forfeited or carried forward amount must be less than the sum of the current
    // and prior year forwarded benefits
    double current_year_benefits;
    current_year_benefits = L[12] + L[13] - L[14];
    if (current_year_benefits < 0.0) {
            fprintf(outfile, "ERROR: Line 14 is greater than line 12 + line 13\n");
            exit(1);
    }

    ShowLineNonZero(12);
    ShowLineNonZero(13);
    ShowLineNonZero(14);

    L[15] = current_year_benefits;
    ShowLineNonZero(15);

    
    // Exemption is only allowed if there are dependent benefits for this year
    if (current_year_benefits > 0.00) {
        // Combine the amounts of part II line 2d, and any extra benefits
        // which were incurred but not paid in 2025.
        L[16] = qualified_expenses_sum + ExtraQualExp;
        ShowLineNonZero(16);
        fprintf(outfile,"INFO: Line 16 is the sum of qualified expenses from Part II, and any extra benefits incurred but not paid in 2025\n");

        L[17] = SmallerOf(L[15], L[16]);
        ShowLineNonZero(17);

        L[18] = your_ei - L18EISub;
        ShowLineNonZero(18);

        if (p_cfg->married_joint) {
            L[19] = spouse_ei - L19EISub;
        } else if (p_cfg->married_sep) {
            // Only if bCkA is checked, replace L[19] value with L[18]
            // else use the entered L[19] value.
            if (bCkA) {
                L[19] = L[18];
            } else {
                L[19] = L19_sep_no_cka;
            }
        } else {    // Any other filing status
            L[19] = L[18];
        }
        showline(19);

        // Smaller of L[17], L[18], L[19]
        L[20] = SmallerOf(L[17], L[18]);
        L[20] = SmallerOf(L[20], L[19]);
        L[20] = NotLessThanZero(L[20]);
        showline(20);

        if (p_cfg->married_sep && !bCkA) {
            L[21] = BENEFIT_LIMIT_MARRIED_SEP;
        } else {
            L[21] = BENEFIT_LIMIT;
        }

        L[21] = SmallerOf(L[21], DepPlanBen);
        showline(21);

        if (L[22] > 0.0) {
            fprintf(outfile, "Ck_L22_Yes X\n");
        } else {
            fprintf(outfile, "Ck_L22_No X\n");
        }
        showline(22);

        L[23] = L[15] - L[22];
        showline(23);

        L[24] = SmallerOf(L[20], L[21]);
        L[24] = SmallerOf(L[24], L[22]);

        showline(24);

        if (L[22] == 0) {
            L[25] = SmallerOf(L[20], L[21]);
        } else {
            L[25] = NotLessThanZero(SmallerOf(L[20], L[21]) - L[24]);
        }
        
        showline(25);

        L[26] = NotLessThanZero(L[23] - L[25]);
        showline(26);

        L[27] = num_qp_credit_limit;
        showline(27);

        L[28] = L[24] + L[25];
        showline(28);

        L[29] = NotLessThanZero(L[27] - L[28]);
        showline(29);

        // No credit can be taken if L[29] is zero
        if (L[29] > 0.0) {
            L[30] = qualified_expenses_sum - L[28];
            showline(30);

            fprintf(outfile, "INFO: Line 30 is the sum of qualified expenses, from Part II, minus line 28: %4.2f - %4.2f = %4.2f\n",
                qualified_expenses_sum, L[28], L[30]);

            L[31] = SmallerOf(L[29], L[30]);
            showline(31);
        }
    }

    //====== Part II, Credit for Childcare and Dependent Care Expenses ===

    // For line 3, if dependent care benefits were received, as indicated by
    // current_year_benefits > 0, use the value from L[31] in Part III; else
    // use the lesser of the actual expenses, and the number of qualified
    // persons credit limit.
    if (current_year_benefits > 0.00) {
        L[3] = L[31];
        if (L[31] == 0.0) {
            fprintf(outfile, "INFO: IMPORTANT!!! Because dependent care benefits were received, part III was filled out, and since line 31 is 0.0, you can't take the credit\n");
        }
    } else {
        L[3] = SmallerOf(qualified_expenses_sum, num_qp_credit_limit);
    }
    showline(3);
    L[4] = your_ei;
    showline(4);
    
    if (p_cfg->married_joint) {
        L[5] = spouse_ei;
    } else {
        L[5] = L[4];
    }
    ShowLineNonZero(5);

    // Set to smallest of: credit limit, sum of qualified expenses, your earned income, and spouse earned income
    L[6] = SmallerOf(L[3], L[4]);
    L[6] = SmallerOf(L[6], L[5]);

    L[6] = NotLessThanZero(L[6]);

    showline(6);

    L[7] = f1040i.L11a;
    showline(7);

    // Show 2 digits of rate as integer, since decimal
    // point is part of the form.
    L[8] = GetLimit(L[7], line_8_rate_table);
    fprintf(outfile, "L8 = %2d\n", (int)((L[8] * 100.0) + 0.5));

#undef RATE_TABLE_TEST
#ifdef RATE_TABLE_TEST
    double ri;
    double rate;
    int rate_digits;
    printf("Rate Table Test\n");
    for (ri = 0.0; ri < 50000.00; ri += 2000.00) {
        rate = GetLimit(ri, line_8_rate_table);
        rate_digits = (int)((rate * 100.0) + 0.5);
        printf("ri: %9.2f, rate: %4.2f, rate_digits: %2d\n", ri, rate, rate_digits);
    }
#endif

    double L9a = L[6] * L[8];
    showline_wlabel("L9a", L9a);

    showline_wlabel("L9b", L9b);

    double L9c = L9a + L9b;
    showline_wlabel("L9c", L9c);

    // Calculate the credit limit worksheet from the instructions
    #define NUM_CREDIT_LIMIT_WORKSHEET_LINES 3
    double clw_L[NUM_CREDIT_LIMIT_WORKSHEET_LINES + 1]; // Allow for 1-based
    clw_L[1] = f1040i.L18;
    clw_L[2] = f1040i.S3_1 + f1040i.S3_6l;
    clw_L[3] = NotLessThanZero(clw_L[1]- clw_L[2]);
    double clw_output = clw_L[3];

    char *clw_line_description[NUM_CREDIT_LIMIT_WORKSHEET_LINES + 1] = {
        "", // Line[0] not used
        "Base tax from L16 plus additional tax from L17 (Form 1040 line 18)",
        "Foreign tax credit (Form 1040, Schedule 3, line 1) plus form 8979 line 14 (Form 1040, line 6l)",
        "Line 1 minus line 2. (If less than 0, enter 0)"
    };

    int line;
    fprintf( outfile, "INFO: Credit limit worksheet\n" );
    for (line = 1; line <= NUM_CREDIT_LIMIT_WORKSHEET_LINES; ++line) {
        fprintf( outfile, "INFO: --- Line %2d: %9.2f : '%s'\n", line, clw_L[line], clw_line_description[line]);
    }

    L[10] = clw_output;
    showline(10);

    L[11] = SmallerOf(L9c, L[10]);
    if (p_cfg->married_sep && !bCkA) {
        fprintf(outfile, "INFO: IMPORTANT!!! Since your filing status is married filing separately, and CkA is not 'Yes', the credit cannot be claimed\n");
        L[11] = 0.0;
    }
    showline(11);

    fclose(infile);
    grab_any_pdf_markups( infname, outfile );
    fclose(outfile);

    printf("\nListing results from file: %s\n\n", outfname);
    Display_File( outfname );

    return 0;
}
